const router = require('koa-router')()
const config = require('../config')
const  Capi = require('../../qcloudapi-sdk');
const  ALY = require('../../aliyun-sdk-js');
const assign = require('object-assign');
const request = require('request')
const  rp = require('request-promise');
const randomstring = require("randomstring");

router.prefix('/v1/hybrid/aliyun')

var ecs = new ALY.ECS({
        accessKeyId: config.aliyun.SecretId,
        secretAccessKey: config.aliyun.SecretKey,
        endpoint: 'https://ecs.aliyuncs.com',
        apiVersion: '2014-05-26'
});

asyncCreateInstance= async (params)=>{
    let bd = await new Promise(function(resolve, reject) {
        ecs.createInstance(params,function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
    return bd;
}

asyncCreateSecurityGroup= async (params)=>{
    let bd = await new Promise(function(resolve, reject) {
        ecs.createSecurityGroup(params,function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
    return bd;
}

asyncDelSecurityGroup= async (params)=>{
        let bd = await new Promise(function(resolve, reject) {
        ecs.deleteSecurityGroup(params,function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
    return bd;
}

var checkBodyRequired = function (ctx,field) {
    if(ctx.request.body[field] == undefined) {
        ctx.throw(400,{message:{code : -12 ,description:'required body field:'+ field}})
    }

    return ctx.request.body[field];
}

var checkParamRequired = function (ctx,field) {
    if(ctx.params[field] === undefined){
        ctx.throw(400,{message:{code : -16 ,description:'required Params field:'+ field}});
    }

    return ctx.params[field];
}

var checkQueryRequired = function (ctx,field) {
    if(ctx.query[field] === undefined){
        ctx.throw(400,{message:{code : -17 ,description:'required Query field:'+ field}});
    }

    return ctx.query[field];
}

router.post('/securityGroup',async (ctx, next) => {
    try{

        var userId = checkBodyRequired(ctx, 'userId');
        var params = {
            RegionId: checkBodyRequired(ctx, 'RegionId'),
            SecurityGroupName: ctx.request.body.SecurityGroupName,
            Description: ctx.request.body.Description,
            VpcId: ctx.request.body.VpcId,
            ClientToken: randomstring.generate(64)
        };
        console.log(JSON.parse(JSON.stringify(params)));
    }
    catch (ex){
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
        return;
    }
    try {
        //2. 调阿里云api
        var startSg = new Date();
        var bd = await asyncCreateSecurityGroup(JSON.parse(JSON.stringify(params)));
        console.log(bd);
        var msDSg = new Date() - startSg;
        console.log(`Write ins info - ${msDSg}ms`);
    }catch (ex){
        console.log(ex);
        if(ex.statusCode) ex.status = ex.statusCode;
        ctx.status = parseInt(ex.status,10);
        ctx.body = {code:-8,description: ex.code + ':'+ ex.message};
        return;
    }

    try {
        //3. 写入数据库
        var dboptions = {
            method: "POST",
            headers: {'content-type' : 'application/x-www-form-urlencoded'},
            url:     config.dbRest.baseUrl + '/inventory/instance',
            form:    {'orderId':'0','orderItemId':'0','userId':userId,'provider':'aliyun','productName':'securityGroup','instanceId':bd.SecurityGroupId,'region':params.RegionId}
        }
        var startDb = new Date();
        var dbbody = await asyncRequest(dboptions);
        //console.log(JSON.stringify(dbbody,4,4));
        var msDB = new Date() - startDb;
        console.log(`Write ins info - ${msDB}ms`);
        if(JSON.parse(dbbody).errors != undefined){
            ctx.throw(500,{message:JSON.parse(dbbody).errors + '  SecurityGroupId:' + bd.SecurityGroupId});
        }

        ctx.status = 200;
        ctx.body = {code:0, SecurityGroupId:bd.SecurityGroupId};
    }catch (ex) {
        ctx.status = ex.status? parseInt(ex.status,10): 503;
        if(ex.errno) ex.message = ex.errno + '  SecurityGroupId:' + bd.SecurityGroupId; // db service exception

        ctx.body = {code :-15 ,description:'inventory DB:' + ex.message};
    }
});

router.delete('/securityGroup/:id',async (ctx, next) => {
    try {
        console.log("Deleting securityGroup id from database");
        var params = {
            SecurityGroupId:checkParamRequired(ctx,'id'),
            RegionId:checkQueryRequired(ctx,'regionId')
        };
        console.log(params);
        //get resource
         var dboptions = {
                method: "GET",
                url: config.dbRest.baseUrl + '/inventory/instance?instanceId=' + params.SecurityGroupId + '&region=' + params.RegionId ,
         }
        var startDb = new Date();
        var dbbody = await asyncRequest(dboptions);
        console.log(JSON.stringify(dbbody,4,4));
        var msDB = new Date() - startDb;
        console.log(`Get ins info - ${msDB}ms`);

        //del resource
        if(JSON.parse(dbbody).length == 1) {
            var delDboptions = {
                method: "DELETE",
                url: config.dbRest.baseUrl + '/inventory/instance/' + JSON.parse(dbbody)[0].id
            }
            console.log(delDboptions);
            var startDelDb = new Date();
            var dbDelbody = await asyncRequest(delDboptions);
            console.log(JSON.stringify(dbDelbody, 4, 4));
            var msDelDB = new Date() - startDelDb;
            console.log(`Del ins info - ${msDelDB}ms`);
            console.log("Delete successfully securityGroup id from database ");

        }else{
            ctx.throw(400,{message:{code:-14,description:'not found resource or not unique.'}})
        }

    }catch(ex){
        console.log(ex);
        ctx.status = ex.status? parseInt(ex.status,10): 503;
        if(ex.errno){
            ex.message = {code :-15 ,description:'inventory DB:' + ex.errno + '  SecurityGroupId:' + params.SecurityGroupId}; // db service exception;
        }
        ctx.body = ex.message;
        return;
    }

    try{
        console.log("Deleting securityGroup");

        var bd = await asyncDelSecurityGroup(params);
        console.log("Delete securityGroup successfully");

        ctx.status = 204;

    }catch (ex){
        console.log(ex);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
        return;
    }
});






module.exports = router