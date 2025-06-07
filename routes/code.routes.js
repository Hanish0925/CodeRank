const express = require('express');
const router = express.Router();
const {getJobStatus,handleCodeExecution,getJobResult} = require('../controllers/code.controller');

router.post('/execute', handleCodeExecution);
router.get('/status/:jobId', getJobStatus);
router.get('/result/:jobId', getJobResult);

module.exports = router;
