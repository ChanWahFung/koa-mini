## 文件结构

`Koa` 源码文件:

* `application.js`: 入口文件，里面包括我们常用的 `use` 方法、`listen` 方法以及对 `ctx.body` 做输出处理
* `context.js`: 主要是做属性和方法的代理，让用户能够更简便的访问到`request`和`response`的属性和方法
* `request.js`: 对原生的 `req` 属性做处理，扩展更多可用的属性和方法，比如：`query` 属性、`get` 方法
* `response.js`: 对原生的 `res` 属性做处理，扩展更多可用的属性和方法，比如：`status` 属性、`set` 方法

## 基础版本

用法：

```js
const Coa = require('./coa/application')
const app = new Coa()

// 应用中间件
app.use((ctx) => {
  ctx.body = '<h1>Hello</h1>'
})

app.listen(3000, '127.0.0.1')
```

`application.js`:

```js
const http = require('http')

module.exports = class Coa {
  use(fn) {
    this.fn = fn
  }
  // listen 只是语法糖  本身还是使用 http.createServer
  listen(...args) {
    const server = http.createServer(this.callback())
    server.listen(...args)
  }
  callback() {
    const handleRequest = (req, res) => {
      // 创建上下文
      const ctx = this.createContext(req, res)
      // 调用中间件
      this.fn(ctx)
      // 输出内容
      res.end(ctx.body)
    }
    return handleRequest
  }
  createContext(req, res) {
    let ctx = {}
    ctx.req = req
    ctx.res = res
    return ctx
  }
}
```

基础版本的实现很简单，调用 `use` 将函数存储起来，在启动服务器时再执行这个函数，并输出 ` ctx.body` 的内容。

但是这样是没有灵魂的。接下来，实现 `context` 和中间件原理，`Koa` 才算完整。

## Context

`ctx` 为我们扩展了很多好用的属性和方法，比如 `ctx.query`、`ctx.set()`。但它们并不是 `context` 封装的，而是在访问 `ctx` 上的属性时，它内部通过属性劫持将 `request` 和 `response` 内封装的属性返回。就像你访问 `ctx.query`，实际上访问的是 `ctx.request.query`。

说到劫持你可能会想到 `Object.defineProperty`，在 `Kao` 内部使用的是 `ES6` 提供的对象的 `setter` 和 `getter`，效果也是一样的。所以要实现 `ctx`，我们首先要实现 `request.js` 和 `response.js`。

在此之前，需要修改下 `createContext` 方法：

```js
// 这三个都是对象
const context = require('./context')
const request = require('./request')
const response = require('./response')

module.exports = class Coa {
  constructor() {
    this.context = context
    this.request = request
    this.response = response
  }
  createContext(req, res) {
    const ctx = Object.create(this.context)
    // 将扩展的 request、response 挂载到 ctx 上
    // 使用 Object.create 创建以传入参数为原型的对象，避免添加属性时因为冲突影响到原对象
    const request = ctx.request = Object.create(this.request)
    const response = ctx.response = Object.create(this.response)
    
    ctx.app = request.app = response.app = this;
    // 挂载原生属性
    ctx.req = request.req = response.req = req
    ctx.res = request.res = response.res = res
    
    request.ctx = response.ctx = ctx;
    request.response = response;
    response.request = request;
    
    return ctx
  }
}
```

上面一堆花里胡哨的赋值，是为了能通过多种途径获取属性。比如获取 `query` 属性，可以有 `ctx.query`、`ctx.request.query`、`ctx.app.query` 等等的方式。

如果你觉得看起来难以理解，其实也可以主要理解这几行：

```js
const request = ctx.request = Object.create(this.request)
const response = ctx.response = Object.create(this.response)

ctx.req = request.req = response.req = req
ctx.res = request.res = response.res = res
```

### request

`request.js`：

```js
const url = require('url')

module.exports = {
 /* 查看这两步操作
  * const request = ctx.request = Object.create(this.request)
  * ctx.req = request.req = response.req = req 
  * 
  * 此时的 this 是指向 ctx，所以这里的 this.req 访问的是原生属性 req
  * 同样，也可以通过 this.request.req 来访问
  */
  get query() {
    return url.parse(this.req.url).query
  },
  get path() {
    return url.parse(this.req.url).pathname
  },
  get method() {
    return this.req.method.toLowerCase()
  }
}
```

### response

`response.js`：

```js
module.exports = {
  // 这里的 this.res 也和上面同理 
  get status() {
    return this.res.statusCode
  },
  set status(val) {
    return this.res.statusCode = val
  },
  get body() {
    return this._body
  },
  set body(val) {
    return this._body = val
  }
}
```

### 属性代理

通过上面的实现，我们可以使用 `ctx.request.query` 来访问到扩展的属性。但是在实际应用中，更常用的是 `ctx.query`。不过 `query` 是在 `request` 的属性，通过 `ctx.query` 是无法访问的。

这时只需稍微做个代理，在访问 `ctx.query`  时，将 `ctx.request.query` 返回就可以实现上面的效果。

`context.js`:

```js
module.exports = {
    get query() {
        return this.request.query
    }
}
```

实际的代码中会有很多扩展的属性，总不可能一个一个去写吧。为了优雅的代理属性，`Koa` 使用 `delegates` 包实现。这里我不打算用 `delegates`，直接简单封装下代理函数。代理函数主要用到`__defineGetter__` 和 `__defineSetter__` 两个方法。

在对象上都会带有 `__defineGetter__` 和 `__defineSetter__`，它们可以将一个函数绑定在当前对象的指定属性上，当属性被获取或赋值时，绑定的函数就会被调用。就像这样：

```js
let obj = {}
let obj1 = {
    name: 'JoJo'
}
obj.__defineGetter__('name', function(){
    return obj1.name
})
```

此时访问 `obj.name`，获取到的是 `obj1.name` 的值。

了解这个两个方法的用处后，接下来开始修改 `context.js`：

```js
const proto = module.exports = {
}

// getter代理
function delegateGetter(prop, name){
  proto.__defineGetter__(name, function(){
    return this[prop][name]
  })
}
// setter代理
function delegateSetter(prop, name){
  proto.__defineSetter__(name, function(val){
    return this[prop][name] = val
  })
}
// 方法代理
function delegateMethod(prop, name){
  proto[name] = function() {
    return this[prop][name].apply(this[prop], arguments)
  }
}

delegateGetter('request', 'query')
delegateGetter('request', 'path')
delegateGetter('request', 'method')

delegateGetter('response', 'status')
delegateSetter('response', 'status')
delegateMethod('response', 'set')
```



## 中间件原理

中间件思想是 `Koa` 最精髓的地方，为扩展功能提供很大的帮助。这也是它虽然小，却很强大的原因。还有一个优点，中间件使功能模块的职责更加分明，一个功能就是一个中间件，多个中间件组合起来成为一个完整的应用。

下面是著名的“洋葱模型”。这幅图很形象的表达了中间件思想的作用，它就像一个流水线一样，上游加工后的东西传递给下游，下游可以继续接着加工，最终输出加工结果。

![](https://images.gitee.com/uploads/images/2020/0609/000828_fe305b09_5014224.jpeg)

### 原理分析

在调用 `use` 注册中间件的时候，内部会将每个中间件存储到数组中，执行中间件时，为其提供 `next` 参数。调用 `next` 即执行下一个中间件，以此类推。当数组中的中间件执行完毕后，再原路返回。就像这样:

```js
app.use((ctx, next) => {
  console.log('1 start')
  next()
  console.log('1 end')
})

app.use((ctx, next) => {
  console.log('2 start')
  next()
  console.log('2 end')
})

app.use((ctx, next) => {
  console.log('3 start')
  next()
  console.log('3 end')
})
```

输出结果如下：

``` txt
1 start
2 start
3 start
3 end
2 end
1 end
```

有点数据结构知识的同学，很快就想到这是一个“栈”结构，执行的顺序符合“先入后出”。

下面我将内部中间件实现原理进行简化，模拟中间件执行：

```js
function next1() {
  console.log('1 start')
  next2()
  console.log('1 end')
}
function next2() {
  console.log('2 start')
  next3()
  console.log('2 end')
}
function next3() {
  console.log('3 start')
  console.log('3 end')
}
next1()
```

**执行过程：**

1. 调用 `next1`，将其入栈执行，输出 `1 start`
2. 遇到 `next2` 函数，将其入栈执行，输出 `2 start`
3. 遇到 `next3` 函数，将其入栈执行，输出 `3 start`
4. 输出 `3 end`，函数执行完毕，`next3` 弹出栈
5. 输出 `2 end`，函数执行完毕，`next2` 弹出栈
6. 输出 `1 end`，函数执行完毕，`next1` 弹出栈
7. 栈空，全部执行完毕

相信通过这个简单的例子，都大概明白中间件的执行过程了吧。

### 原理实现

中间件原理实现的关键点主要就是 `ctx` 和 `next` 的传递。

因为中间件是可以异步执行的，最后需要返回 `Promise`。

```js
function compose(middleware) {
  return function(ctx) {
    return dispatch(0)
    function dispatch(i){
      // 取出中间件
      let fn = middleware[i]
      if (!fn) {
        return Promise.resolve()
      }
      // dispatch.bind(null, i + 1) 为应用中间件接受到的 next
      // next 即下一个应用中间件的函数引用
      try {
        return Promise.resolve( fn(ctx, dispatch.bind(null, i + 1)) )
      } catch (error) {
        return Promise.reject(error)
      }
    }
  }
}
```

可以看到，实现过程本质是函数的递归调用。在内部实现时，其实 `next` 没有做什么神奇的操作，它就是下一个中间件调用的函数，作为参数传入供使用者调用。

下面我们来使用一下 `compose`，你可以将它粘贴到控制台上运行：

```js
function next1(ctx, next) {
  console.log('1 start')
  next()
  console.log('1 end')
}
function next2(ctx, next) {
  console.log('2 start')
  next()
  console.log('2 end')
}
function next3(ctx, next) {
  console.log('3 start')
  next()
  console.log('3 end')
}

let ctx = {}
let fn = compose([next1, next2, next3])
fn(ctx)
```
