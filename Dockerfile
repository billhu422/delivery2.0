FROM node:latest 
#RUN apt update && apt-get install -y language-pack-zh-hans
#RUN locale-gen zh_CN.UTF-8 &&\
#  DEBIAN_FRONTEND=noninteractive dpkg-reconfigure locales
#RUN locale-gen zh_CN.UTF-8
#ENV LANG zh_CN.UTF-8
#ENV LANGUAGE zh_CN:zh
#ENV LC_ALL zh_CN.UTF-8

RUN apt-get update && apt-get -y install curl && apt-get -y install git  && apt-get -y install vim && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
#&& curl -sL https://deb.nodesource.com/setup_7.x |  bash - &&  apt-get install -y nodejs


WORKDIR /opt
RUN git clone https://github.com/billhu422/delivery2.0.git && \
        cd delivery2.0 && \
	git checkout -b hybrid tags/v2.4 && \
        npm install

RUN git clone https://github.com/billhu422/qcloudapi-sdk.git && \
        cd qcloudapi-sdk && \
        npm install

RUN git clone https://github.com/billhu422/epilogue.git && \
        cd epilogue && \
        git checkout -b hybrid tags/v2.1&& \
        npm install


expose 3000

CMD  node /opt/epilogue/examples/server.js & node /opt/delivery2.0/bin/www
