require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, migrate } = require('./db');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ message: 'Delivery Tracker API' });
});

const port = process.env.PORT || 4000;
const start = async () => {
  await migrate();
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
};

start();
