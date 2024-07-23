const express = require('express');
const bodyParser = require('body-parser');
const { Eureka } = require('eureka-js-client');

const app = express();
app.use(bodyParser.json());  // Middleware to parse JSON requests

const eurekaClient = new Eureka({
  instance: {
    app: 'node-service',
    hostName: 'node-service',
    ipAddr: 'node-service',
    statusPageUrl: 'http://node-service:3000',
    port: {
      '$': 3000,
      '@enabled': 'true',
    },
    vipAddress: 'node-service',
    dataCenterInfo: {
      '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
      name: 'MyOwn',
    },
  },
  eureka: {
    host: 'eureka-server',
    port: 8761,
    servicePath: '/eureka/apps/',
  },
});

eurekaClient.start((error) => {
  if (error) {
    console.error('Error starting Eureka client:', error);
  } else {
    console.log('Eureka client started');
  }
});

app.post('/process', (req, res) => {
  try {
    console.log('Request body:', req.body);  // Debugging line
    const { value } = req.body;
    if (typeof value !== 'number') {
      return res.status(400).json({ error: 'Value must be a number' });
    }
    const result = value * 2;
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Node service running on http://localhost:${port}`);
});
