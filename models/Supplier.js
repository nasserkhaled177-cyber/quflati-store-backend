const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  city: String,
  password: { type: String, required: true },
  companyName: String,
}, { timestamps: true })
schema.pre('save', async function(next){
  if(!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})
module.exports = mongoose.model('Supplier', schema)
