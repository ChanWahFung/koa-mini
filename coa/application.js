const http = require('http')
const context = require('./context')
const request = require('./request')
const response = require('./response')

module.exports = class Coa {
  constructor() {
    this.middleware = []
    this.context = context
    this.request = request
    this.response = response
  }

  use(fn) {
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    this.middleware.push(fn)
    return this
  }

  listen(...args) {
    const server = http.createServer(this.callback())
    server.listen(...args)
    console.log(`App listen to ${args[1] || '127.0.0.1'}:${args[0]}`)
  }

  callback() {
    const handleRequest = (req, res) => {
      // 创建上下文
      const ctx = this.createContext(req, res)
      // fn 为第一个应用中间件的引用
      const fn = this.compose(this.middleware)
      return this.handleRequest(ctx, fn)
    }
    return handleRequest
  }

  // 创建上下文
  createContext(req, res) {
    const ctx = Object.create(this.context)
    // 处理过的属性
    const request = ctx.request = Object.create(this.request)
    const response = ctx.response = Object.create(this.response)
    // 原生属性
    ctx.req = request.req = response.req = req
    ctx.res = request.res = response.res = res
    ctx.state = {}
    return ctx
  }

  handleRequest(ctx, fn) {
    return fn(ctx).then(() => respond(ctx)).catch(console.error)
  }

  // 中间件处理逻辑实现
  compose(middleware) {
    return function(ctx) {
      return dispatch(0)
      function dispatch(i){
        let fn = middleware[i]
        if (!fn) {
          return Promise.resolve()
        }
        // dispatch.bind(null, i + 1) 为应用中间件接受到的 next
        // next 即下一个应用中间件的函数引用
        try {
          return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)))
        } catch (error) {
          return Promise.reject(error)
        }
      }
    }
  }
}

// 处理 body 不同类型输出
function respond(ctx) {
  let res = ctx.res
  let body = ctx.body
  if (typeof body === 'string') {
    return res.end(body)
  }
  if (typeof body === 'object') {
    return res.end(JSON.stringify(body))
  }
}