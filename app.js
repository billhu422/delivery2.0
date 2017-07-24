const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')
const OAuth2 = require('./lib/oauth2').OAuth2
const config = require('./config')

const index = require('./routes/index')
const users = require('./routes/users')
const inventory = require('./routes/inventory')


// error handler
onerror(app)

// middlewares
app.use(bodyparser({
  enableTypes:['json', 'form', 'text']
}))
app.use(json())
app.use(logger())
app.use(require('koa-static')(__dirname + '/public'))

app.use(views(__dirname + '/views', {
  extension: 'ejs'
}))

// logger
app.use(async (ctx, next) => {
  const start = new Date()
  await next()
  const ms = new Date() - start
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})
var oauth_client = new OAuth2(config.client_id,
                    config.client_secret,
                    config.account_server,
                    '/oauth2/authorize',
                    '/oauth2/token',
                    config.callbackURL);

asyncOauthGet= async(url,accessToken)=>{
    let oauthGet = await new Promise(function(resolve,reject){
        oauth_client.get(url, accessToken,function(e,response){
            if (e) {
               //console.log(e);
                reject(e);
            }else{
                //console.log(response.toString());
                resolve(response.toString());
            }
        });
    });
    return oauthGet;
}

app.use(async(ctx, next) => {
    try{
            console.log('Validating user authorization token' );
            var access_token = ctx.request.get('Authorization').split(" ")[1];
            var url = config.oauth.account_server + '/user';
            let user = await asyncOauthGet(url, access_token);
            //console.log(user);
            if(JSON.parse(user).email != config.oauth.username) ctx.throw(400, '{"code" : -2, "description" : "User\'s role is not seller(admin)"}');
            await next();
        }
        catch (ex){
            //console.log(222);
            console.log(ex.message);
            ctx.status = parseInt(ex.statusCode,10);
            ctx.body = ex.data;
        }
});

// routes
app.use(index.routes(), index.allowedMethods())
app.use(users.routes(), users.allowedMethods())
app.use(inventory.routes(),inventory.allowedMethods())

module.exports = app