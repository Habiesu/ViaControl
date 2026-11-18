---
name: web-security-owasp
description: >-
  Guía de seguridad web basada en OWASP Top 10 para desarrolladores. Úsala cuando
  el usuario necesite implementar controles de seguridad, revisar vulnerabilidades,
  hacer code reviews de seguridad, proteger endpoints, manejar autenticación/autorización
  segura, prevenir inyecciones, XSS, CSRF, o implementar cualquier buena práctica
  de seguridad en aplicaciones web.
---

# Seguridad Web — OWASP Top 10 para Desarrolladores

Guía práctica de implementación basada en el OWASP Top 10 (2021).
Trata el OWASP Top 10 como tu **hoja de ruta de priorización** y esta guía
como tu **manual de implementación**.

---

## OWASP Top 10 — Resumen Rápido

| # | Riesgo | Descripción |
|---|--------|-------------|
| A01 | **Broken Access Control** | El más común. Usuarios acceden a recursos no autorizados |
| A02 | **Cryptographic Failures** | Datos sensibles sin cifrar o cifrado débil |
| A03 | **Injection** | SQL, NoSQL, OS, LDAP injection |
| A04 | **Insecure Design** | Falta de patrones de diseño seguros desde el inicio |
| A05 | **Security Misconfiguration** | Configuraciones por defecto inseguras |
| A06 | **Vulnerable Components** | Dependencias desactualizadas o con CVEs conocidos |
| A07 | **Auth & Identity Failures** | Autenticación y gestión de sesiones deficiente |
| A08 | **Software Integrity Failures** | CI/CD inseguro, deserialización no validada |
| A09 | **Logging & Monitoring Failures** | Sin auditoría, sin alertas de incidentes |
| A10 | **SSRF** | Server-Side Request Forgery |

---

## A01 — Control de Acceso Roto

### Principios
- **Denegar por defecto**: todo acceso denegado salvo que se permita explícitamente.
- **Mínimo privilegio**: cada usuario/servicio sólo tiene los permisos mínimos necesarios.
- **Verificar en el servidor**: nunca confiar en controles del lado cliente.

### Implementación

```typescript
// ❌ MAL: verificación en el cliente fácilmente bypasseable
if (user.role === 'admin') {
  showAdminPanel();
}

// ✅ BIEN: verificación en el servidor
// middleware/auth.ts
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

// En la ruta
router.get('/admin/users', requireAdmin, getUsers);
```

### Prevenir IDOR (Insecure Direct Object Reference)

```typescript
// ❌ MAL: acceso directo por ID sin verificar propiedad
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  return res.json(order);
});

// ✅ BIEN: siempre verificar que el recurso pertenece al usuario
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await db.orders.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id  // ← filtrar por usuario autenticado
    }
  });
  if (!order) return res.status(404).json({ error: 'No encontrado' });
  return res.json(order);
});
```

---

## A02 — Fallos Criptográficos

### Datos en tránsito

```
# Forzar HTTPS en toda la aplicación
# nginx.conf
server {
  listen 80;
  return 301 https://$host$request_uri;
}

# Headers de seguridad
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### Datos en reposo — Hashing de contraseñas

```typescript
import bcrypt from 'bcrypt';

// ❌ MAL: guardar contraseña en texto plano o MD5/SHA1
const user = { password: md5(password) };

// ✅ BIEN: usar bcrypt, argon2 o scrypt
const SALT_ROUNDS = 12;

async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```

### Datos sensibles en variables de entorno

```typescript
// ❌ MAL: secretos hardcodeados
const apiKey = 'sk-prod-abc123xyz';

// ✅ BIEN: usar variables de entorno
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error('API_KEY no configurada');

// .env (nunca commitear al repositorio)
// .gitignore debe incluir: .env, .env.local, .env.production
```

---

## A03 — Inyección

### SQL Injection

```typescript
// ❌ MAL: concatenación de strings (vulnerable a SQL injection)
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ BIEN: consultas parametrizadas
// Con Prisma
const user = await prisma.user.findFirst({ where: { email } });

// Con pg (node-postgres)
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// Con Supabase
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email);
```

### XSS (Cross-Site Scripting)

```typescript
// ❌ MAL: insertar HTML sin sanitizar
element.innerHTML = userInput;
document.write(userInput);

// ✅ BIEN: usar textContent o sanitizar
element.textContent = userInput;

// Si necesitas HTML, usar DOMPurify
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);

// En React: JSX escapa automáticamente. Evitar dangerouslySetInnerHTML
// ❌ <div dangerouslySetInnerHTML={{ __html: userInput }} />
// ✅ <div>{userInput}</div>
```

### Content Security Policy (CSP)

```http
# Headers CSP restrictivos
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.tudominio.com;
  frame-ancestors 'none';
```

---

## A07 — Fallos de Autenticación e Identidad

### Tokens JWT seguros

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!; // min 256 bits

// ❌ MAL: sin expiración, algoritmo débil
jwt.sign({ userId }, 'secret');

// ✅ BIEN: con expiración, algoritmo fuerte, secreto robusto
const token = jwt.sign(
  { userId, role: user.role },
  JWT_SECRET,
  {
    algorithm: 'HS256',
    expiresIn: '15m',   // tokens de acceso cortos
    issuer: 'tuapp.com',
    audience: 'tuapp-users'
  }
);

// Refresh tokens separados (vida más larga, rotación)
const refreshToken = jwt.sign(
  { userId, tokenFamily: uuid() },
  REFRESH_SECRET,
  { expiresIn: '7d' }
);
```

### Protección contra Brute Force

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,                    // máximo 5 intentos
  message: 'Demasiados intentos, inténtalo más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/auth/login', authLimiter, loginHandler);
app.post('/auth/forgot-password', authLimiter, forgotPasswordHandler);
```

### Gestión segura de sesiones

```typescript
import session from 'express-session';

app.use(session({
  secret: process.env.SESSION_SECRET!,
  name: '__Host-session',  // prefijo __Host- para seguridad extra
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,   // no accesible desde JavaScript
    secure: true,     // solo HTTPS
    sameSite: 'strict', // protección CSRF
    maxAge: 1000 * 60 * 15  // 15 minutos
  }
}));
```

---

## A05 — Mala Configuración de Seguridad

### Headers HTTP de seguridad

```typescript
import helmet from 'helmet';

// Express: usar Helmet para todos los headers de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Headers adicionales importantes
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
```

### CORS configurado correctamente

```typescript
import cors from 'cors';

// ❌ MAL: permitir todos los orígenes
app.use(cors());

// ✅ BIEN: lista blanca de orígenes
const allowedOrigins = [
  'https://tuapp.com',
  'https://www.tuapp.com',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : [])
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## A08 — Fallos de Integridad de Software

### Validación de entrada (Input Validation)

```typescript
import { z } from 'zod';

// Definir esquemas estrictos para toda entrada del usuario
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'La contraseña debe tener mayúsculas, minúsculas y números'
  ),
  name: z.string().min(2).max(100).trim(),
  role: z.enum(['user', 'moderator']).default('user')
});

app.post('/api/users', async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten() });
  }
  // Usar parsed.data, no req.body directamente
  const { email, password, name, role } = parsed.data;
});
```

### Subida de archivos segura

```typescript
import multer from 'multer';
import path from 'path';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    // Verificar MIME type (no solo extensión)
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
  storage: multer.memoryStorage() // procesar en memoria, no guardar directamente
});

// Nunca usar el nombre de archivo original del usuario
// Generar un nombre seguro
const safeFilename = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
```

---

## A09 — Registro y Monitoreo

### Logging de seguridad

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'body.password', 'body.token']
});

// Eventos de seguridad que SIEMPRE deben loguearse
function logSecurityEvent(event: string, details: Record<string, unknown>) {
  logger.warn({
    type: 'SECURITY_EVENT',
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
}

// Uso
logSecurityEvent('LOGIN_FAILED', { email, ip: req.ip, attempts: failedAttempts });
logSecurityEvent('UNAUTHORIZED_ACCESS', { userId, resource: req.path, ip: req.ip });
logSecurityEvent('PASSWORD_CHANGED', { userId, ip: req.ip });
```

### Eventos críticos a monitorear

- Intentos de login fallidos (especialmente múltiples seguidos)
- Accesos denegados (403)
- Errores del servidor (500) con información de contexto
- Cambios en permisos o roles de usuarios
- Accesos a datos sensibles
- Cambios de contraseña / recuperación de cuenta
- Tokens inválidos o expirados

---

## A10 — SSRF (Server-Side Request Forgery)

```typescript
import { URL } from 'url';

// ❌ MAL: hacer fetch directo a URL del usuario
app.get('/fetch', async (req, res) => {
  const data = await fetch(req.query.url);
  return res.json(await data.json());
});

// ✅ BIEN: validar y restringir URLs
function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // Solo HTTPS
    if (url.protocol !== 'https:') return false;
    
    // Lista blanca de dominios permitidos
    const allowedDomains = ['api.tuservicio.com', 'cdn.tuapp.com'];
    if (!allowedDomains.includes(url.hostname)) return false;
    
    // Bloquear IPs privadas/localhost
    const privateIpRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|localhost)/;
    if (privateIpRegex.test(url.hostname)) return false;
    
    return true;
  } catch {
    return false;
  }
}
```

---

## Checklist de Seguridad Pre-Producción

### Autenticación y Autorización
- [ ] ¿Todos los endpoints están protegidos con autenticación?
- [ ] ¿Se verifica propiedad del recurso (anti-IDOR)?
- [ ] ¿Rate limiting en endpoints de auth?
- [ ] ¿Tokens con expiración corta?
- [ ] ¿Contraseñas hasheadas con bcrypt/argon2?

### Datos y Criptografía
- [ ] ¿HTTPS forzado en toda la app?
- [ ] ¿Datos sensibles no logueados?
- [ ] ¿Secretos en variables de entorno (no en código)?
- [ ] ¿`.env` en `.gitignore`?

### Seguridad HTTP
- [ ] ¿Headers de seguridad configurados (helmet)?
- [ ] ¿CSP implementado?
- [ ] ¿CORS restringido a dominios conocidos?
- [ ] ¿Cookies con `httpOnly`, `secure`, `sameSite`?

### Input/Output
- [ ] ¿Toda entrada del usuario validada con esquemas (Zod/Joi)?
- [ ] ¿Sin SQL/NoSQL concatenados?
- [ ] ¿XSS prevenido (sin innerHTML sin sanitizar)?
- [ ] ¿Subida de archivos con validación de tipo y tamaño?

### Dependencias y Configuración
- [ ] ¿`npm audit` sin vulnerabilidades críticas?
- [ ] ¿Dependencias actualizadas?
- [ ] ¿Modo debug/desarrollo deshabilitado en producción?
- [ ] ¿Mensajes de error sin información interna expuesta?

### Monitoreo
- [ ] ¿Logs de eventos de seguridad activos?
- [ ] ¿Alertas para intentos de acceso fallidos?
- [ ] ¿Sin datos sensibles en logs?

---

## Referencias Rápidas

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Proactive Controls](https://owasp.org/www-project-top-ten-proactive-controls/)
- [Mozilla Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [securityheaders.com](https://securityheaders.com/) — Verifica headers de tu sitio
