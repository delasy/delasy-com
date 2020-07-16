const express = require('express')
const path = require('path')

const app = express()

app.use(express.static(path.join(__dirname, '../build')))

app.all('*', (req, res) => {
  res.status(404)
  res.sendFile(path.join(__dirname, '../build/_error.html'))
})

app.listen(process.env.PORT || 8080)
