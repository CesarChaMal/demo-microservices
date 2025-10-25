const express = require('express');
const { Eureka } = require('eureka-js-client');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const PORT = process.env.PORT || 3000;
const EUREKA_HOST = process.env.EUREKA_HOST || 'eureka-server';

const app = express();
app.use(express.json());  // Built-in JSON parser

// Swagger setup
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Node Service API',
      version: '1.0.0',
      description: 'API documentation for the Node microservice'
    },
  },
  apis: ['./app.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Eureka registration
const eurekaClient = new Eureka({
  instance: {
    app: 'node-service',
    hostName: 'node-service',
    ipAddr: 'node-service',
    statusPageUrl: `http://node-service:${PORT}/info`,
    port: {
      '$': PORT,
      '@enabled': 'true',
    },
    vipAddress: 'node-service',
    dataCenterInfo: {
      '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
      name: 'MyOwn',
    },
  },
  eureka: {
    host: EUREKA_HOST,
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

/**
 * @swagger
 * /process:
 *   post:
 *     summary: Doubles the input value.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: number
 *                 example: 5
 *     responses:
 *       200:
 *         description: Doubled result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number
 */
app.post('/process', (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is required' });
    }
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

/**
 * @swagger
 * /info:
 *   get:
 *     summary: Returns basic service metadata.
 *     responses:
 *       200:
 *         description: Service info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 app:
 *                   type: string
 *                 status:
 *                   type: string
 */
app.get('/info', (req, res) => {
  res.json({
    app: 'node-service',
    status: 'running'
  });
});

app.listen(PORT, () => {
  console.log(`Node service running on http://node-service:${PORT}`);
});
