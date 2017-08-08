var config = {}

config.oauth = {
    account_server: 'http://124.251.62.217:8000',
    //account_server: 'http://192.168.87.152:8000',
    client_id: '9c9bca6d26234ff98fb93df3e3d065c5',
    client_secret: 'e1396a545ace426a941c0edfd3403d0f',
    grant_type : 'password',
    username : 'laoguo.cn@gmail.com',
    password: '12345',
};

config.eco = {
    baseUrl: 'http://124.251.62.215:8000',
    orderPath: '/DSProductOrdering/api/productOrdering/v2/productOrder',
};

config.dbRest = {
    baseUrl : 'http://localhost:3001',
};

config.qcloud = {
    SecretId: 'AKID2sYy826AMHzTjoMHemobCcXHm47vLoul',
    SecretKey: 'mLjxwgDVebNtEKEvPeePuBCxTjlopfGg',
};
config.qcloud.region = [
  { "name" : "北京", "value": 8},
  { "name" : "上海", "value": 4},
  { "name" : "广州", "value": 1},
];

config.aliyun = {
    SecretId: 'LTAIzgYvg0hVfNMK',
    SecretKey: '3ExrKEf611ODomcjdpWus8mX4JIsJ4',
};

config.aliyun.ecs = {
    操作系统:'ImageId',

}
module.exports = config;
