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

router.use(async (ctx, next) => {
     try {
        console.log('Fetching order info');
        var orderId = ctx.request.body.orderId;
        if(orderId  == undefined) ctx.throw(400,{code:-4,description:'Need orderId.'});

        var adminAccessToken = ctx.get('Authorization');
         var options = {
                //relatedParty.id=yangrui&&relatedParty.role=Seller
                method : 'GET',
                url: config.eco.baseUrl + config.eco.orderPath + "/?id=" + orderId  + "&relatedParty.role=Seller",
                headers: {
                        'Authorization': adminAccessToken
                }
        };

//        console.log("header:" + JSON.stringify(options,4,4));
        var startOder = new Date();
        let bd  = await asyncRequest(options);
        //console.log(bd);
        var msOder = new Date() - startOder;
        console.log(`fetchOrder - ${msOder}ms`)

        var order = JSON.parse(bd)[0];
        if(order == undefined) ctx.throw(400,{code:-5,description:'Not found order.'});

//        console.log(JSON.stringify(order,4,4));
        //Validating Paid status
        console.log('Validating Paid status');
        var textObj = order.note.filter(function(x){return x.text=="Paid"})[0];
        if( textObj ==undefined ) ctx.throw(400, {code:-6,description:'The order is not paied, cannot  delivery an instance by the order'});

        ctx.adminAccessToken = adminAccessToken;
        ctx.order = order;
        await next();
    }
    catch (ex){
        console.log(ex);
        console.log(ex.message);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
        return;
    }
});

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

var checkRelatedPartyMandatory = function (ctx,charArray,charname) {
        var len = charArray.filter(function(x){return x.role==charname}).length;
        if(len == 0){
            ctx.throw(400,{message:{code:-9,description:'Characteristic ' + charname + " is empty"}});
        }else if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }

        return charArray.filter(function(x){return x.role==charname})[0].id;
}


var checkCharacteristicMandatory = function (ctx,charArray,charname) {
        var len = charArray.filter(function(x){return x.name==charname}).length;
        if(len == 0){
            ctx.throw(400,{message:{code:-9,description:'Characteristic ' + charname + " is empty"}});
        }else if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }

        return charArray.filter(function(x){return x.name==charname})[0].value;
}

var checkCharacteristicOptional =function (charArray,charname) {
        var len = charArray.filter(function(x){return x.name==charname}).length;
        if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }else if(len == 0){
            return undefined;
        }else if(len == 1){
            return charArray.filter(function(x){return x.name==charname})[0].value;
        }
}


router.post('/ecs',async (ctx, next) => {
    //Handle OrderItem
    var RENEWFLAG = {
        false :'NOTIFY_AND_MANUAL_RENEW',
        true : 'NOTIFY_AND_AUTO_RENEW',
    };

    var createInsJson =
    {
    Region: undefined,
    Action: 'RunInstances',
    Version: "2017-03-12",
    InstanceChargeType: undefined,
    InstanceChargePrepaid: {
        Period: undefined,
        RenewFlag: undefined
    },
    Placement: {
        Zone: undefined,
        ProjectId: undefined,
        HostIds : undefined
    },
    InstanceType: undefined,
    ImageId: undefined,
    SystemDisk: {
        DiskType: undefined,
        DiskId:undefined,
        DiskSize: undefined
    },
    VirtualPrivateCloud: {
        VpcId: undefined,
        SubnetId: undefined,
        AsVpcGateway:undefined,
        PrivateIpAddresses:undefined
    },
    InternetAccessible: {
        InternetChargeType: undefined,
        InternetMaxBandwidthOut: undefined,
        PublicIpAssigned: undefined
    },
    InstanceCount: undefined,
    InstanceName: undefined,
    LoginSettings: {
        Password: undefined,
        KeyIds:undefined,
        KeepImageLogin: undefined,
    },
    EnhancedService: {
        SecurityService: {
            Enabled: undefined
        },
        MonitorService: {
            Enabled: undefined
        }
    },
    ClientToken: undefined
}
    try {
        console.log('Fetching orderItem info');
        var instanceIds = [];
        var order = ctx.order;
        var orderId = order.id;
        var adminAccessToken = ctx.adminAccessToken;

        for(itemIndex in order.orderItem){
            var item = order.orderItem[itemIndex];
        //order.orderItem.forEach(function(item){ //await 只能直接写在async函数内，也就是说，不能写在forEach中。
            //Check orderItem's state must be Acknowledged or InProgess
            console.log('Validate orderItem state');
            if(item.state != 'Acknowledged' && item.state != "InProgress") ctx.throw(400,{code:-7,description:'Only Acknowledged or InProgess can be manually modified'});

            //fetch product characteristicValue
            //var userId = item.product.relatedParty.filter(function(x){return x.role=="Customer"})[0].id;
            var userId = checkRelatedPartyMandatory(ctx,item.product.relatedParty,'Customer');
            var provider = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'provider');
            var productName = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'productname');
            //ecs parameters/////////////////////////////////////////////
            var ImageId = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'操作系统');
            var InstanceType = checkCharacteristicOptional(item.product.productCharacteristic,'机型');
            var Zone = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'地域');
            var Region = Zone.split('-')[0] + '-' +  Zone.split('-')[1];
            var InternetMaxBandwidthOut = parseInt(checkCharacteristicOptional(item.product.productCharacteristic,'带宽'),10);
            var Period = parseInt(checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'购买时长'),10);
            var RenewFlag = RENEWFLAG[checkCharacteristicOptional(item.product.productCharacteristic,'自动续费')];
            var ClientToken = randomstring.generate(64);
            var SecurityGroupId = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'安全组ID');
            //console.log(JSON.stringify(createInsJson,4,4));

            ///////////////////////////////////////////////////////////////////////////////////////////////
            //Deliver item
            console.log('Delivering item');

            var params = {
                Action:'CreateInstance',
                RegionId: Region,
                ZoneId:Zone,
                ImageId:ImageId,
                InstanceType:InstanceType,
                SecurityGroupId:SecurityGroupId,
                InternetMaxBandwidthOut:InternetMaxBandwidthOut,
                Period:Period,
                AutoRenew:RenewFlag,
                ClientToken:ClientToken
            }
            var ecsbd = asyncCreateInstance(params)
            console.log(ecsbd);
            //ecsbd.InstanceId;
            //write instance info into inventory database
            console.log("Write product info into database");
            var instanceId = 'ecsins-000000z1';
            var dboptions = {
                method: "POST",
                headers: {'content-type' : 'application/x-www-form-urlencoded'},
                url:     config.dbRest.baseUrl + '/inventory/instance',
                form:    {'orderId':orderId,'orderItemId':item.id,'userId':userId,'provider':provider,'productName':productName,'instanceId':instanceId,'region':createInsJson.Region}
            }

            var startDb = new Date();
            var dbbody = await asyncRequest(dboptions);
//            console.log(JSON.stringify(dbbody,4,4));
            var msDB = new Date() - startDb;
            console.log(`Write ins info - ${msDB}ms`);

            instanceIds.push({"id": instanceId });

            //update item state
            item.state = "Completed";
 //           console.log(JSON.stringify(item));
			var itemOptions = {
			        method: 'PATCH',
                    headers: {'content-type' : 'application/json','Authorization': adminAccessToken},
                    url: config.eco.baseUrl + config.eco.orderPath + "/" + orderId,
                    body:    '{ "orderItem":[' + JSON.stringify(item) + ']}'
                    }

            var startPatch = new Date();
            var itembody = await asyncRequest(itemOptions);
            console.log(adminAccessToken);
            console.log(itembody);
            var msPatch = new Date() - startPatch;
            console.log(`Patch Order - ${msPatch}ms`);
        }//for items

        ctx.status = 200;
        ctx.body ='{"code":0,"instances":'+ JSON.stringify(instanceIds) + '}';
        console.log(ctx.body);
        }catch (ex){
        //item state change to Held
            console.log(ex);
            console.log(ex.message);
            ctx.status = parseInt(ex.status,10);
            ctx.body = ex.message;
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
            ex.message = {code :-16 ,description:'inventory DB:' + ex.errno + '  SecurityGroupId:' + params.SecurityGroupId}; // db service exception;
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