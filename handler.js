const AWS = require('aws-sdk');

/**
 * Configure your domain names here:
 */
const allowedOrigins = [
  'example.com',
];

/**
 * A list of allowed metrics (payload attributes). You don't need to change that.
 */
const allowedMetrics = [
  'bounce',
  'browser',
  'country',
  'device',
  'duration',
  'enter',
  'events',
  'exit',
  'os',
  'pageviews',
  'referrer',
  'unique',
  'utm',
];

const client = new AWS.CloudWatch({
  region: 'us-east-1',
});

function pushMetric(arr, metric, value) {
  arr.push({
    MetricName: metric,
    Dimensions: [{
      Name: metric,
      Value: String(value),
    }],
    Unit: 'Count',
    Value: 1,
  });
}

function getMetrics(payload) {
  return Object.keys(payload).reduce((acc, metric) => {
    if (allowedMetrics.includes(metric)) {
      const value = payload[metric];
      switch (metric) {
        case 'pageviews':
          for (let pageview of value) {
            pushMetric(acc, metric, pageview.path);
            if (pageview.enter) {
              pushMetric(acc, 'enter', pageview.path);
            }
            if (pageview.exit) {
              pushMetric(acc, 'exit', pageview.path);
            }
          }
          break;
        case 'events':
          for (let event of value) {
            pushMetric(acc, metric, event);
          }
          break;
        default:
          pushMetric(acc, metric, value);
      }
    }
    return acc;
  }, []);
}

module.exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers || {};
  const country = headers['cloudfront-viewer-country'] ? headers['cloudfront-viewer-country'][0].value : null;
  const origin = headers['origin'] ? headers['origin'][0].value : null;
  let body;

  try {
    body = JSON.parse(Buffer.from(request.body.data, 'base64').toString());
  } catch {
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: JSON.stringify({
        error: 'Invalid payload.',
      }),
    };
  }

  if (!origin) {
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: JSON.stringify({
        error: 'Origin header must be set.',
      }),
    };
  }
  
  const namespace = origin?.replace(/^https?\:\/\//, '');

  if (!allowedOrigins?.includes(namespace)) {
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: JSON.stringify({
        error: 'Origin not allowed',
      }),
    };
  }
  try {
    const metrics = getMetrics(body);

    if (country) {
      pushMetric(metrics, 'country', country);
    }

    await client.putMetricData({
      MetricData: metrics,
      Namespace: namespace,
    }).promise();
  } catch (err) {
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }

  return {
    status: '200',
    statusDescription: 'OK',
    body: JSON.stringify({
      success: true,
    }),
  };
};

