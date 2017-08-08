/**
 * Created by billh on 2017/7/24.
 */
const router = require('koa-router')()
const config = require('../config')
const  Capi = require('../../qcloudapi-sdk');
const assign = require('object-assign');
const request = require('request')
const querystring = require('querystring');
const  rp = require('request-promise');


router.get('/v1/hybrid/instance',async(ctx, next)=>{
   try{
       var option = {
            url:     config.dbRest.baseUrl + '/inventory/instance?'+ querystring.stringify(ctx.query),
            }
        var dbbody = await rp.get(option);
        ctx.status = 200;
        ctx.body ={code:0,instances:JSON.parse(dbbody)};
   }
   catch (ex){
       console.log(ex.message);
       ctx.status = parseInt(ex.status,10);
       ctx.message = ex.message;
   }
});

module.exports = router