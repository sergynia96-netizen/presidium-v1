# 🔐 PRESIDIUM Security Guidelines

## Немедленные действия

### 1. Отозвать текущий API ключ GLM-4

**Текущий ключ в `.env` скомпрометирован** — он был показан в чате.

**Действия:**
1. Зайдите на https://open.bigmodel.cn/usercenter/apikeys
2. Найдите скомпрометированный ключ в списке API-ключей
3. Нажмите **Revoke** (Отозвать)
4. Создайте новый ключ
5. Скопируйте и вставьте в `.env.local` (НЕ в `.env`!)

### 2. Переместить ключи в правильное место

```bash
# Переименовать .env в .env.local (если ещё не сделано)
mv .env .env.local

# Убедиться что .env.local в .gitignore
git check-ignore .env.local
```

### 3. Проверить git history

Если `.env` уже был закоммичен:

```bash
# Удалить из git history
git rm --cached .env
git commit -m "Remove .env from tracking"

# Очистить историю (если нужно)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

---

## Структура файлов окружения

```
.env.example      ✅ Можно коммитить (шаблон без секретов)
.env.local        ❌ Никогда не коммитить (локальные секреты)
.env              ❌ Никогда не коммитить (устарело, использовать .env.local)
```

---

## Генерация секретов

### NextAuth Secret
```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes(32))
```

### Database URL (Production)
```bash
# PostgreSQL
DATABASE_URL="postgresql://user:$(openssl rand -hex 16)@localhost:5432/presidium"
```

---

## Чек-лист безопасности

- [ ] Отозвать текущий GLM-4 ключ
- [ ] Создать новый GLM-4 ключ
- [ ] Переместить в `.env.local`
- [ ] Проверить `.gitignore`
- [ ] Удалить `.env` из git (если был закоммичен)
- [ ] Сгенерировать `NEXTAUTH_SECRET`
- [ ] Настроить rate limiting
- [ ] Включить HTTPS в production

---

## Production рекомендации

1. **Использовать secrets manager:**
   - Vercel Environment Variables
   - AWS Secrets Manager
   - Azure Key Vault

2. **Включить HTTPS:**
   - Vercel/Netlify (автоматически)
   - Let's Encrypt (свой сервер)

3. **Настроить CORS:**
   ```typescript
   // next.config.ts
   async headers() {
     return [{
       source: '/api/:path*',
       headers: [
         { key: 'Access-Control-Allow-Origin', value: 'https://yourdomain.com' }
       ]
     }]
   }
   ```

4. **Добавить security headers:**
   ```typescript
   // next.config.ts
   async headers() {
     return [{
       source: '/:path*',
       headers: securityHeaders
     }]
   }

   const securityHeaders = [
     { key: 'X-DNS-Prefetch-Control', value: 'on' },
     { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
     { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
     { key: 'X-Content-Type-Options', value: 'nosniff' },
     { key: 'X-XSS-Protection', value: '1; mode=block' },
     { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
   ]
   ```
