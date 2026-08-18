'use strict';

/**
 * The one place a notification leaves the system — HLD §4.7.
 *
 *   if (SNS_TOPIC_ARN)  → SNS Publish
 *   else if (SMTP_HOST) → Nodemailer
 *   always              → NOTIF# item in DynamoDB (in-app)
 *
 * No use case imports the SNS SDK or Nodemailer directly. The delivery path is
 * decided once, here; if the Learner Lab turns out to block SNS, nobody else's
 * code changes (UC-019 E5).
 *
 * The in-app write happens FIRST and is conditional, so a duplicate EventBridge
 * invocation is stopped before anything is sent rather than after.
 */

const { putNotification, markDelivery } = require('../dynamo/notifications');

const RETRY_DELAY_MS = 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let snsClient = null;

function log(event, fields) {
  console.log(JSON.stringify({ level: 'INFO', event, ...fields }));
}

/** SNS is required lazily so the SMTP path never pays for the SDK's cold start. */
function sns() {
  if (!snsClient) {
    // eslint-disable-next-line global-require
    const { SNSClient } = require('@aws-sdk/client-sns');
    snsClient = new SNSClient({});
  }
  return snsClient;
}

async function publishSns({ subject, body, email }) {
  // eslint-disable-next-line global-require
  const { PublishCommand } = require('@aws-sdk/client-sns');
  await sns().send(new PublishCommand({
    TopicArn: process.env.SNS_TOPIC_ARN,
    // SNS caps Subject at 100 chars and rejects newlines outright.
    Subject: String(subject).replace(/\s+/g, ' ').slice(0, 99),
    Message: email ? `${body}\n\n— DeadlineIQ (${email})` : body,
  }));
  return 'sns';
}

async function sendSmtp({ subject, body, email }) {
  if (!email) throw new Error('no email address on the profile');
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_USER || 'deadlineiq@localhost',
    to: email,
    subject,
    text: body,
  });
  return 'smtp';
}

function channelAvailable() {
  if (process.env.SNS_TOPIC_ARN) return 'sns';
  if (process.env.SMTP_HOST) return 'smtp';
  return null;
}

/**
 * @param {object} message
 * @param {string} message.userId    from the authoriser or the roster, never a body
 * @param {string} message.rule      digest|same_day_nudge|escalation|crash_week|overdue_group
 * @param {string} message.date      local date — the idempotency key's first segment
 * @param {string} [message.taskId]  the subject task, where the rule has one
 * @param {string} message.subject
 * @param {string} message.body
 * @param {string} [message.email]   delivery address from PROFILE
 * @param {boolean} [message.emailEnabled] UC-020: in-app can never be turned off
 * @returns {Promise<{delivered:boolean, channel:string, duplicate?:boolean, failure?:string}>}
 */
async function send(message) {
  const {
    userId, rule, date, taskId, subject, body, email, emailEnabled = true,
  } = message;

  const now = new Date().toISOString();
  const record = await putNotification(userId, {
    rule,
    date,
    taskId: taskId || null,
    subject,
    body,
    channel: 'in_app',
    delivered: false,
    deliveredAt: null,
    readAt: null,
    createdAt: now,
    absorbed: Boolean(message.absorbed),
    // A test send is a real delivery but not a scheduled one: it must not eat
    // the student's daily cap (UC-020 step 6 vs UC-019 step 5).
    test: Boolean(message.test),
  });

  // Already written by an earlier invocation — send nothing, say nothing.
  if (!record) {
    log('notification_duplicate', { userId, rule, date });
    return { delivered: false, channel: 'in_app', duplicate: true };
  }

  const channel = emailEnabled && !message.absorbed ? channelAvailable() : null;
  if (!channel) {
    log('notification_in_app', { userId, rule, reason: emailEnabled ? 'no_channel_configured' : 'email_disabled' });
    // An absorbed message is not delivered — it is waiting for the next digest
    // (step 5). An in-app-only one has arrived where the student will see it.
    if (!message.absorbed) {
      await markDelivery(userId, record.SK, { delivered: true, deliveredAt: now });
    }
    return { delivered: !message.absorbed, channel: 'in_app' };
  }

  const deliver = channel === 'sns' ? publishSns : sendSmtp;

  try {
    await deliver({ subject, body, email });
  } catch (first) {
    // E1 — one retry after 3 s, then keep the in-app copy and flag it.
    await sleep(RETRY_DELAY_MS);
    try {
      await deliver({ subject, body, email });
    } catch (second) {
      console.error(JSON.stringify({
        level: 'ERROR', event: 'notification_delivery_failed', userId, rule, channel, message: second.message,
      }));
      await markDelivery(userId, record.SK, { delivered: false, failure: second.message });
      return { delivered: false, channel, failure: second.message };
    }
  }

  await markDelivery(userId, record.SK, { delivered: true, deliveredAt: new Date().toISOString() });
  log('notification_sent', { userId, rule, channel });
  return { delivered: true, channel };
}

module.exports = { send, channelAvailable };
