const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const codeRoutes = require('./routes/code.routes');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api', codeRoutes);

app.get('/', (req, res) => {
  res.send('CodeRank backend is running');
});

module.exports = app;
