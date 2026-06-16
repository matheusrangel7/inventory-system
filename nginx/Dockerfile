FROM nginx:alpine

ENV NGINX_ENVSUBST_FILTER=^NGINX_
ENV NGINX_HSTS_VALUE=max-age=0

COPY default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80 443
