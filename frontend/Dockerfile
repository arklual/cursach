# Multi-stage build для Angular SPA
# Этап 1: build Angular dist
FROM node:20-alpine AS build
WORKDIR /app

# Сначала только манифесты — кэшируем npm ci
COPY package.json package-lock.json ./
RUN npm ci

# Потом остальной код
COPY . .

# Production build (Angular кладёт в dist/<projectName>/browser в v17+)
RUN npm run build -- --configuration production

# Этап 2: runtime — nginx с собранной статикой и SPA-конфигом
FROM nginx:1.27-alpine AS runtime

# Удаляем дефолтный конфиг, чтобы наш не игнорировался
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf

# Имя проекта подставит сам Angular — в Angular 17+ дефолтная схема dist/<name>/browser.
# Копируем всю содержимое dist в /usr/share/nginx/html. Если структура dist/<name>/browser,
# в финальный образ попадут вложенные папки, но nginx будет искать в /usr/share/nginx/html — для SPA
# обычно нужно указать конкретный путь. Здесь делаем wildcard и плоский layout:
COPY --from=build /app/dist/ /usr/share/nginx/html-staging/
RUN cd /usr/share/nginx/html-staging && \
    if [ -d "$(ls -1d */browser 2>/dev/null | head -n1)" ]; then \
        cp -r */browser/. /usr/share/nginx/html/; \
    elif [ -d "$(ls -1d */ 2>/dev/null | head -n1)" ]; then \
        cp -r */. /usr/share/nginx/html/; \
    fi && \
    rm -rf /usr/share/nginx/html-staging

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
