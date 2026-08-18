'use strict';

/**
 * API Gateway Lambda authoriser — UC-001 step 8, HLD §10.1.
 *
 * This is the only place `userId` enters the system. It verifies the JWT and
 * returns an Allow policy carrying `context.userId`, which handlers read from
 * `event.requestContext.authorizer.userId` and never from a request body.
 *
 * Throwing the exact string 'Unauthorized' is API Gateway's contract for a
 * 401; anything else surfaces as a 500.
 */

const { verify, bearer } = require('../lib/auth/jwt');

/**
 * The policy is cached per token for 300 s (template.yaml ReauthorizeEvery),
 * so it must cover the whole API rather than the single method that happened
 * to be called first — otherwise the second, different request reuses a
 * policy that does not name it and is denied.
 */
function apiWildcard(methodArn) {
  const [arn, aws, service, region, accountId, rest] = methodArn.split(':');
  const apiId = String(rest).split('/')[0];
  const stage = String(rest).split('/')[1];
  return [arn, aws, service, region, accountId, `${apiId}/${stage}/*/*`].join(':');
}

exports.handler = async (event) => {
  const token = bearer(event.authorizationToken);
  if (!token) throw new Error('Unauthorized');

  let user;
  try {
    user = verify(token);
  } catch (error) {
    // Expired, tampered or malformed all look the same from here. The
    // frontend attempts one silent refresh on any 401 (UC-001 E3).
    throw new Error('Unauthorized');
  }

  return {
    principalId: user.userId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: apiWildcard(event.methodArn),
      }],
    },
    context: { userId: user.userId, email: user.email },
  };
};
