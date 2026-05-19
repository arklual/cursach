#!/usr/bin/env bash
# Идемпотентный bootstrap-скрипт первой настройки VPS под Ubuntu/Debian.
# Запускать ОДИН раз вручную от root (или с sudo):
#   curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/main/deploy/install-server.sh | sudo bash
# Либо склонировать репо и запустить локально.
#
# Что делает:
#   1. Ставит Docker + compose-plugin официальным способом.
#   2. Создаёт пользователя `deploy` для CI (без пароля, только по SSH-ключу).
#   3. Кладёт его в группу docker.
#   4. Создаёт /opt/kursach с правами deploy:deploy.
#   5. Включает фаервол (опционально, если ufw установлен) на 22 и 80.
#   6. Просит вручную положить публичный ключ деплоя в /home/deploy/.ssh/authorized_keys.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "[!] Запусти от root или через sudo" >&2
    exit 1
fi

echo "[1/6] Обновляю apt и ставлю базовые пакеты"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw

if ! command -v docker >/dev/null 2>&1; then
    echo "[2/6] Устанавливаю Docker Engine"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "[2/6] Docker уже установлен, пропускаю"
fi

systemctl enable --now docker

if ! id deploy >/dev/null 2>&1; then
    echo "[3/6] Создаю пользователя deploy"
    useradd -m -s /bin/bash deploy
    passwd -l deploy   # пароль заблокирован, только SSH-ключ
else
    echo "[3/6] Пользователь deploy уже есть, пропускаю"
fi

echo "[4/6] Добавляю deploy в группу docker"
usermod -aG docker deploy

DEPLOY_HOME=/home/deploy
mkdir -p "${DEPLOY_HOME}/.ssh"
chmod 700 "${DEPLOY_HOME}/.ssh"
touch "${DEPLOY_HOME}/.ssh/authorized_keys"
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"
chown -R deploy:deploy "${DEPLOY_HOME}/.ssh"

mkdir -p /opt/kursach
chown deploy:deploy /opt/kursach

if command -v ufw >/dev/null 2>&1; then
    echo "[5/6] Настраиваю ufw (22, 80, 443)"
    ufw allow OpenSSH || true
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
    ufw --force enable || true
fi

echo ""
echo "[6/6] Готово. Дальше — ВРУЧНУЮ:"
echo "  1. Положи публичный ключ деплоя в /home/deploy/.ssh/authorized_keys"
echo "     echo 'ssh-ed25519 AAAA... deploy@github-actions' >> /home/deploy/.ssh/authorized_keys"
echo "  2. Скопируй deploy/docker-compose.prod.yml и deploy/.env.example в /opt/kursach/"
echo "  3. Создай /opt/kursach/.env с реальными паролями (chmod 600)."
echo "  4. Положи SSL-сертификат и ключ на сервер:"
echo "     mkdir -p /opt/kursach/ssl"
echo "     scp tls.crt tls.key server:/opt/kursach/ssl/"
echo "     chmod 600 /opt/kursach/ssl/tls.key"
echo "  5. Создай htpasswd для basic auth на фронте (без файла nginx не стартует):"
echo "     docker run --rm httpd:alpine htpasswd -nbB <user> <password> > /opt/kursach/.htpasswd"
echo "     chmod 600 /opt/kursach/.htpasswd"
echo "     # webhook (/v1/webhook/*) остаётся открытым — внешние системы дёргают его без пароля."
echo "  6. Отключи парольный SSH-вход для безопасности:"
echo "     sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl reload sshd"
echo ""
echo "После этого CI/CD на push в main будет автоматически обновлять контейнеры."
