# 🃏 TCG Arena — Tournament Manager MVP

Aplicación web para gestionar torneos de TCG (Trading Card Games) con sistema de mesas, emparejamiento automático y vistas en tiempo real para organizadores y espectadores.

## 🚀 Instalación Rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor
npm start
# → http://localhost:3000

# (Modo desarrollo con hot-reload)
npm run dev
```

## 👥 Usuarios de Prueba

| Usuario         | Contraseña | Rol         | Especial                    |
|-----------------|------------|-------------|-----------------------------|
| `admin_store`   | `1234`     | Organizador | Licencia activa (torneos rankeados) |
| `jugador_uno`   | `1234`     | Jugador     | —                           |
| `jugador_dos`   | `1234`     | Jugador     | —                           |
| *(jugador_tres … jugador_nueve)* | `1234` | Jugador | — |

## 📁 Estructura del Proyecto

```
tcg-tournament/
├── server.js               ← Punto de entrada Express
├── package.json
├── lib/
│   ├── store.js            ← Estado en memoria (base de datos MVP)
│   └── matchmaking.js      ← Algoritmo de emparejamiento y mesas
├── routes/
│   ├── auth.js             ← Login, registro, logout, /me
│   └── tournaments.js      ← CRUD torneos, jugadores, rondas, puntos
└── public/
    └── index.html          ← SPA completa (HTML + CSS + JS)
```

## 🎮 Flujo de Uso

### Como Organizador
1. Inicia sesión con `admin_store / 1234`
2. Click **"Crear Torneo"** en el home
3. Define nombre, rondas y premios
4. En el **Lobby**, busca y agrega jugadores por nombre
5. Click **"Iniciar Torneo"** — se generan las mesas automáticamente
6. En cada ronda: asigna puntos con `+/-`, elimina jugadores de mesa si es necesario
7. Al finalizar, click **"Finalizar Ronda"** → revisa puntos → confirma
8. El sistema genera la siguiente ronda con emparejamiento tipo Snake

### Como Espectador
- Cualquier usuario (incluso sin cuenta) puede ver la vista de espectador
- Accede al link del torneo → ve mesas activas, scores y tabla de posiciones

## ⚙️ Algoritmo de Emparejamiento

### Cálculo de mesas (`lib/matchmaking.js`)
Prioriza mesas de 4, luego de 3, evita mesas de 2:
- 10 jugadores → `[4, 3, 3]` ✅ (no `[4, 4, 2]`)
- 9 jugadores  → `[3, 3, 3]`
- 7 jugadores  → `[4, 3]`

### Ronda 1: Aleatorio
Jugadores mezclados al azar.

### Rondas 2+: Snake/Extremos
Agrupa los mejores con los peores:
- 12 jugadores: Mesa 1 = P1+P2+P11+P12, Mesa 2 = P3+P4+P9+P10, Mesa 3 = P5+P6+P7+P8

## 🔌 API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Iniciar sesión |
| `POST` | `/auth/register` | Registrar usuario |
| `POST` | `/auth/logout` | Cerrar sesión |
| `GET`  | `/auth/me` | Usuario actual |
| `GET`  | `/api/tournaments` | Listar torneos |
| `POST` | `/api/tournaments` | Crear torneo |
| `GET`  | `/api/tournaments/:id` | Detalle de torneo |
| `POST` | `/api/tournaments/:id/players` | Agregar jugador |
| `DELETE` | `/api/tournaments/:id/players/:userId` | Quitar jugador |
| `POST` | `/api/tournaments/:id/start` | Iniciar torneo |
| `POST` | `/api/tournaments/:id/rounds/:rid/activate` | Activar ronda |
| `PATCH` | `/api/tournaments/:id/rounds/:rid/tables/:tid/players/:uid` | Actualizar score/eliminación |
| `POST` | `/api/tournaments/:id/rounds/:rid/finish` | Finalizar ronda |
| `PUT`  | `/api/tournaments/:id/rounds/:rid/tables` | Sobreescribir mesas (drag & drop) |
| `GET`  | `/api/users/search?q=...` | Buscar jugadores |

## 🔮 Próximas Funcionalidades (Post-MVP)

- [ ] Base de datos SQLite persistente
- [ ] Drag & drop visual para reorganizar mesas
- [ ] WebSockets para actualizaciones en tiempo real (sin polling)
- [ ] Filtro de torneos por ubicación (geolocalización)
- [ ] Sistema de ranking global por organizador (licencia)
- [ ] Exportar resultados a PDF
- [ ] Modo espectador con URL única pública

## 🎨 Stack Técnico

- **Backend**: Node.js + Express + express-session
- **Frontend**: Vanilla JS (ES6+), HTML5, Tailwind CSS CDN
- **Fuentes**: Cinzel (display) + Rajdhani (body)
- **Almacenamiento**: In-memory (MVP) → fácilmente migrable a SQLite/PostgreSQL
