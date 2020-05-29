const Coa = require('./coa')
const app = new Coa()

app.use((ctx, next) => {
  console.log('1 start')
  next()
  console.log('1 end')
  ctx.body = {
    code: ctx.state.code,
    msg: 'success'
  }
})

app.use((ctx, next) => {
  console.log('2 start')
  next()
  ctx.state = {
    code: 200
  }
  console.log('2 end')
})

app.listen(3000, '127.0.0.1')