# TCG Arena - Tournament Manager MVP

Aplicacion web para gestionar torneos de TCG con mesas, emparejamiento automatico,
puntajes por ronda, solicitudes de ingreso y vistas para organizadores/espectadores.

## Instalacion

```bash
npm install
npm start
```

Servidor por defecto:

```txt
http://localhost:3000
```

Modo desarrollo:

```bash
npm run dev
```

Tests unitarios:

```bash
npm test
```

## Variables de entorno

Crear `.env` en la raiz:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/tcg-arena
SESSION_SECRET=un-secreto-largo
```

En produccion `SESSION_SECRET` es obligatorio.

## Estructura

```txt
server.js
src/
  app.js
  server.js
  config/
  shared/
    http/
    middleware/
    utils/
  modules/
    auth/
    users/
    tournaments/
      domain/
public/
  index.html
  css/
    app.css
  js/
    app.js
tests/
  unit/
  integration/
```

## Arquitectura

El backend usa un monolito modular por dominio:

- `routes`: define endpoints y middlewares.
- `controllers`: traduce HTTP a casos de uso.
- `services`: contiene reglas de negocio.
- `repositories`: concentra acceso a Mongo/Mongoose.
- `presenters`: decide que datos salen al cliente.
- `validators`: normaliza y valida body/query/params.
- `domain`: funciones puras testeables, como matchmaking y scoring.

## Terminologia

- Organizador oficial: cuenta con `isLicensed=true`, normalmente una tienda suscrita.
- Organizador normal: cualquier usuario que organiza un torneo.
- Torneo oficial: torneo creado por un organizador oficial; otorga ranking y exige minimo 8 jugadores.
- Torneo normal: torneo no oficial; exige minimo 2 jugadores.

## Funcionalidades principales

- Ranking por organizador oficial para torneos oficiales.
- Invitaciones con preferencia de jugador: manual o aceptacion automatica.
- Metodos de emparejamiento: `snake`, `random` y `balanced`.
- Banca por ronda para jugadores fuera de mesas activas.
- Agregar, eliminar y mezclar mesas antes de iniciar una ronda.
- Panel de jugadores para puntaje global, descalificacion, reintegro e invitaciones.
- Correccion posterior de mesas finalizadas, incluyendo ganador, puntajes y eliminados.

## Usuarios de prueba

La base se inicializa con usuarios de prueba si no existen usuarios:

```txt
admin_store / 1234
jugador_uno / 1234
jugador_dos / 1234
jugador_tres ... jugador_nueve / 1234
```

## API principal

```txt
POST   /auth/login
POST   /auth/register
POST   /auth/logout
GET    /auth/me
GET    /auth/profile/:userId

GET    /api/users/search?q=...

GET    /api/tournaments
POST   /api/tournaments
GET    /api/tournaments/:id
POST   /api/tournaments/:id/players
DELETE /api/tournaments/:id/players/:userId
PATCH  /api/tournaments/:id/players/:userId/score
PATCH  /api/tournaments/:id/join-requests/:userId
PATCH  /api/tournaments/:id/invitations/me
POST   /api/tournaments/:id/start
PATCH  /api/tournaments/:id/settings
PUT    /api/tournaments/:id/rounds/:roundId/tables
POST   /api/tournaments/:id/rounds/:roundId/tables
POST   /api/tournaments/:id/rounds/:roundId/tables/shuffle
DELETE /api/tournaments/:id/rounds/:roundId/tables/:tableId
PATCH  /api/tournaments/:id/rounds/:roundId/tables/:tableId/players/:userId
POST   /api/tournaments/:id/rounds/:roundId/tables/:tableId/finish
POST   /api/tournaments/:id/rounds/:roundId/tables/:tableId/revise
POST   /api/tournaments/:id/rounds/:roundId/activate
POST   /api/tournaments/:id/rounds/:roundId/finish
PATCH  /api/tournaments/:id/players/:userId/status
```
