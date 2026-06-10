# Plan de Implementación — Gourmet Madrid Automatizaciones
  
**Fecha**: 10 de junio de 2026  
**Proyecto**: Automatizaciones n8n para Gourmet Madrid Tours

---

## Índice

1. [Contexto Rápido](#1-contexto-rápido)
2. [Cómo Llegan los Emails (con Ejemplos)](#2-cómo-llegan-los-emails)
3. [El Problema de los Duplicados](#3-el-problema-de-los-duplicados)
4. [Estructura de Google Sheets](#4-estructura-de-google-sheets)
5. [Flujo Clasificación v2 — Nodo por Nodo](#5-flujo-clasificación-v2)
6. [Flujo Calendar Sync — Cambios](#6-flujo-calendar-sync)
7. [Configuración de Servicios](#7-configuración-de-servicios)
8. [Testing](#8-testing)
9. [Deploy](#9-deploy)

---

## 1. Contexto Rápido

**Gourmet Madrid** vende tours de vinos y tapas en Madrid. Usan:
- **Turitop** como motor de reservas (el "motor principal")
- **GetYourGuide (GYG)**, **Civitatis** y **Viator** como plataformas de venta
- **Google Calendar** para llevar el control visual de reservas
- **Gmail** (`info@gourmetmadrid.com`) para recibir emails de todas las plataformas

### Arquitectura de datos

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   TURITOP    │    │  GYG / CIVI / │    │   CLIENTES   │
│  (reservas)  │    │   VIATOR     │    │  (email)     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │ Webhook           │ Email             │ Email
       │ POST              │ (mod/cancel)      │ (preguntas)
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  CALENDAR    │    │ CLASIFICACIÓN │    │  EMAIL IA    │
│    SYNC      │    │   EMAILS v2   │    │  (Gemini)    │
│  (20 nodos)  │    │  (~25 nodos)  │    │  (13 nodos)  │
└──────────────┘    └──────────────┘    └──────────────┘
       │                   │
       │                   │ Si hay modificación
       │◄──────────────────┘
       │ (webhook calendar-mod)
       ▼
┌──────────────┐
│   GOOGLE     │
│   CALENDAR   │
└──────────────┘
```

### Flujo de datos completo

1. **Reserva nueva**: Turitop envía webhook → Calendar Sync crea evento + registra en Sheet
2. **Email Turitop**: Gmail recibe email → Clasificación lo clasifica por día+actividad
3. **Modificación GYG**: Gmail recibe email GYG → Clasificación procesa con LLM → marca original como superseded → espera 2º email Turitop
4. **2º email Turitop**: Clasificación detecta que es reemplazo → actualiza Calendar
5. **Cancelación**: Clasificación elimina evento de Calendar + notifica equipo
6. **Pregunta cliente**: Email IA responde automáticamente con Gemini

---

## 2. Cómo Llegan los Emails

### 2.1 Email de Reserva — Turitop/Viator

**Remite**: `no-reply@turitop.com`  
**Asunto**: `Your booking details - Ruta de Vinos y Tapas`

```
Booking number: G193-260607-4
Service name: Wine and Tapas Tour
Event date: (Sunday) 7 June 2026 19:30
Order summary:
Adult (13+) 2 x 85EUR
TOTAL 123.58EUR
Status: confirmed
Customer:
Jana Roy
+12062277595
```

**Después viene el bloque VIATOR ADDITIONAL INFO** (si la reserva viene de Viator):

```
*** VIATOR ADDITIONAL INFO ***
SupplierProductcode: 13791
Booking Reference: 1407404977
Contact Details:
  ContactName: Jana Roy
  ContactValue: US+1 2062277595
Travellers:
  traveler 0: GivenName:Jana, Surname:Roy, AgeBand:ADULT
  traveler 1: GivenName:Passenger, Surname:Two, AgeBand:ADULT
```

**Campos a extraer**:
| Campo | Regex/Localización | Ejemplo |
|-------|-------------------|---------|
| booking_id | `G193-\d{6}-\d+` | G193-260607-4 |
| tour_name | Después de `Service name:` | Wine and Tapas Tour |
| event_date | `Event date:.*(\d{1,2})\s+\w+\s+(\d{4})` | 7 June 2026 |
| people | `Adult.*?(\d+) x` | 2 |
| customer_name | Después de `Customer:` | Jana Roy |
| customer_phone | Línea que empieza con `+` después del nombre | +12062277595 |
| tour_code | Mapear tour_name → código (ver tabla abajo) | WT |

**Mapeo de tours**:
```
Wine and Tapas Tour → WT
Wine Tour → WT
Wine and Tapas Walking Tour → WT
Tapas Tour Tarde → TT
Tapas Tour Mañana → TM
Tapas & Wine Tasting Tour → TT
Curso de Cata → CCATA
Wine Tour a Ribera del Duero → WTR
```

---

### 2.2 Email de Modificación — GetYourGuide

**Remite**: `do-not-reply@notification.getyourguide.com`  
**Asunto**: `Booking detail change: - S03973 - GYGBLHMBZM7L`

```
Hi GOURMET MADRID TOURS Y EVENTOS S.L
We would like to inform you that the following booking has changed.

Madrid: Tapas & Wine Tasting Tour with Local Guide
Madrid: Wine and Tapas Walking Tour

Booking reference GYGBLHMBZM7L

Date New June 16, 2026 at 7:30 PM
June 17, 2026 at 12:30 PM

Number of participants 1
Language English
```

**Campos a extraer (con LLM)**:
| Campo | Localización | Ejemplo |
|-------|-------------|---------|
| reference_code | En el asunto o cuerpo: `GYGXXXXXXX` | GYGBLHMBZM7L |
| modification_type | Contexto: "has changed" | modify |
| customer_name | NO APARECE en este email | - |
| tour_description | Líneas después de "has changed" | Madrid: Tapas & Wine Tasting Tour |
| old_date | Fecha que aparece primero | June 17, 2026 at 12:30 PM |
| new_date | "Date New" + fecha | June 16, 2026 at 7:30 PM |
| people | "Number of participants" | 1 |

**NOTA**: Este email NO contiene código Turitop (G193). Solo tiene el código GYG.

---

### 2.3 Email de Cancelación — GetYourGuide

**Remite**: `do-not-reply@notification.getyourguide.com`  
**Asunto**: `A booking has been canceled - S03973 - GYGBLHN328YQ`

```
GYGBLHN328YQ was cancelled

Hi supply partner,
We're writing to let you know that the following booking has been canceled.

Reference Number: GYGBLHN328YQ
Tour: Madrid Region Wineries Guided Tour with Wine Tastings
Date: June 9, 2026, 9:30 AM
Name: Patricia Silva

Please remove this customer from your list.
```

**Campos a extraer (con LLM)**:
| Campo | Localización | Ejemplo |
|-------|-------------|---------|
| reference_code | `GYGXXXXXXX` o en asunto | GYGBLHN328YQ |
| modification_type | "has been canceled" | cancel |
| customer_name | "Name:" | Patricia Silva |
| tour_description | "Tour:" | Madrid Region Wineries Guided Tour |
| event_date | "Date:" | June 9, 2026 |

---

### 2.4 Email de Cancelación — Civitatis

**Remite**: `notificaciones@civitatis.com`  
**Asunto**: `Reserva cancelada A39368254: Tour de tapas y vinos por Madrid`

```
La reserva ha sido cancelada

Actividad: Tour de tapas y vinos por Madrid - Tour en español
Número de reserva: 39368254
Referencia externa: C731-G193-260604-29
Ciudad: Madrid
Idioma: Español
Fecha: Sábado, 18 de julio de 2026
Hora: 19:30 (7:30 pm)
Personas: 5 adultos x 98,65 US$ 493,25 US$ (425 €)
Cliente: Virginia Espinel Nobile
```

**Campos a extraer**:
| Campo | Localización | Ejemplo |
|-------|-------------|---------|
| reference_code | "Número de reserva:" | A39368254 |
| turitop_code | "Referencia externa:" → extraer G193 | G193-260604-29 |
| modification_type | "cancelada" | cancel |
| customer_name | "Cliente:" | Virginia Espinel Nobile |
| tour_name | "Actividad:" | Tour de tapas y vinos por Madrid |
| event_date | "Fecha:" | 18 julio 2026 |
| people | "Personas:" → "5 adultos" | 5 |

**HALLAZGO IMPORTANTE**: La referencia externa de Civitatis **SÍ contiene el código Turitop (G193)**. Esto permite vincular directamente sin necesidad de LLM para este caso.

---

### 2.5 Resumen: Qué email llega de cada plataforma

| Plataforma | Tipo de email | Código propio | Código Turitop visible | Vinculación |
|-----------|---------------|---------------|----------------------|-------------|
| Turitop | Reserva (confirmación) | G193-XXXXXX-X | ✅ Sí | Directo |
| GetYourGuide | Modificación | GYGXXXXXXX | ❌ No | Por nombre+tour+fecha |
| GetYourGuide | Cancelación | GYGXXXXXXX | ❌ No | Por nombre+tour+fecha |
| Civitatis | Cancelación | AXXXXXXXX | ✅ Sí (en ref externa) | Directa por ref externa |
| Viator | Reserva | Booking Reference largo | ✅ Sí (en bloque ADDITIONAL INFO) | Directa |

---

## 3. El Problema de los Duplicados

### Escenario real: Modificación de 4 a 5 personas

```
DÍA 1 — 10:00 AM
📧 Email 1 (Turitop): "Your booking details - Wine Tour"
   → Booking: G193-260607-4
   → Personas: 4
   → Calendar crea evento: "WT 4"
   → Sheet guarda: {booking_id: G193-260607-4, people: 4, status: active}

DÍA 2 — 11:00 AM  
📧 Email 2 (GYG): "Booking detail change"
   → Reference: GYGBLHMBZM7L
   → "4 personas → 5 personas"
   → ❌ ACTUALMENTE SE IGNORA (no hay filtro para GYG)
   → Calendar: sin cambios
   → Sheet: sin cambios

DÍA 2 — 11:05 AM
📧 Email 3 (Turitop): "Your booking details - Wine Tour"
   → Booking: G193-260607-4 (MISMO booking_id)
   → Personas: 5
   → Calendar crea SEGUNDO evento: "WT 5"
   → Sheet guarda SEGUNDO registro: {booking_id: G193-260607-4, people: 5, status: active}

RESULTADO ACTUAL:
  Calendar tiene 2 eventos: WT 4 + WT 5 = 9 personas (❌ INCORRECTO)
  Sheet tiene 2 registros del mismo booking_id

RESULTADO ESPERADO:
  Calendar tiene 1 evento: WT 5 (✅ CORRECTO)
  Sheet tiene: registro 1 = superseded, registro 2 = active
```

### Por qué pasa esto

1. El flujo de Clasificación solo detecta Turitop (ignora GYG)
2. El flujo de Calendar Sync recibe 2 webhooks del mismo booking_id
3. No hay lógica para detectar que el 2º email es una actualización del 1º
4. El código `modify` en Calendar Sync no hace nada: `updatedTotal = currentTotal`

### La solución

```
CUANDO LLEGA EMAIL GYG (modificación):
1. LLM extrae: código GYG, customer_name, tour, old_date, new_date
2. Buscar en Sheet "reservas": customer_name + tour + fecha ±1mes
3. Si encontrado → marcar reserva original como "superseded"
4. Notificar al equipo: "Modificación detectada, esperando actualización"

CUANDO LLEGA EMAIL TURITOP (después de modificación):
1. Extraer datos normalmente
2. Buscar en Sheet "reservas": ¿hay reserva "superseded" con mismo customer+tour+fecha?
3. Si SÍ → este email es la actualización
4. Actualizar Calendar con los nuevos datos (reemplazar evento)
5. Marcar nueva reserva como "active", anterior como "replaced"
```

---

## 4. Estructura de Google Sheets

### Sheet "reservas" (ya existe parcialmente)

Crear o verificar que tiene estas columnas:

| Col | Nombre | Tipo | Ejemplo | Descripción |
|-----|--------|------|---------|-------------|
| A | booking_id | string | G193-260607-4 | ID Turitop |
| B | gyg_reference | string | GYGBLHN328YQ | Código GYG (se llena después) |
| C | civitatis_ref | string | A39368254 | Referencia Civitatis |
| D | customer_name | string | Jana Roy | Nombre del cliente |
| E | tour_code | string | WT | Código del tour |
| F | tour_name | string | Wine and Tapas Tour | Nombre completo del tour |
| G | event_date | date | 2026-06-07 | Fecha del tour |
| H | people | number | 2 | Personas |
| I | status | string | active | active / superseded / cancelled / replaced |
| J | version | number | 1 | 1=original, 2=actualizado |
| K | source | string | turitop | turitop / gyg / civitatis / viator |
| L | calendar_event_id | string | abc123@group.calendar.google.com | ID evento Calendar |
| M | notes | string | Nota especial | Notas de la reserva |
| N | timestamp | datetime | 2026-06-07T10:00:00 | Cuándo se registró |

### Sheet "clasificación_emails" (NUEVO — crear)

| Col | Nombre | Tipo | Ejemplo | Descripción |
|-----|--------|------|---------|-------------|
| A | message_id | string | 18abc123 | Gmail message ID |
| B | source | string | gyg | turitop / gyg / civitatis / viator |
| C | subject | string | Booking detail change | Asunto del email |
| D | from | string | do-not-reply@notification.getyourguide.com | Remitente |
| E | reference_code | string | GYGBLHMBZM7L | Código de referencia |
| F | turitop_code | string | G193-260607-4 | Código Turitop (si se encontró) |
| G | customer_name | string | Jana Roy | Nombre cliente |
| H | tour_code | string | WT | Código tour |
| I | event_date | date | 2026-06-07 | Fecha del tour |
| J | people | number | 2 | Personas |
| K | modification_type | string | modify | new / modify / cancel |
| L | old_date | string | June 17, 2026 | Fecha anterior (si modificación) |
| M | new_date | string | June 16, 2026 | Fecha nueva (si modificación) |
| N | label_applied | string | Turitop/2026/06/1-WT | Gmail label aplicada |
| O | linked_booking_id | string | G193-260607-4 | booking_id vinculado |
| P | status | string | classified | classified / superseded / pending_review |
| Q | timestamp | datetime | 2026-06-10T14:00:00 | Cuándo se procesó |

### Sheet "confirmaciones_guías" (ya existe)

Verificar columnas:
- confirm_id, guia_codigo, guia_nombre, tour_code, fecha, personas, calendar_event_id, estado, canal, timestamp_envio, timeout_horas

---

## 5. Flujo Clasificación v2 — Nodo por Nodo

### Nodo 1: Gmail Trigger

**Tipo**: `n8n-nodes-base.gmailTrigger`  
**Configuración**:
```json
{
  "pollTimes": {
    "item": [{ "mode": "everyMinute" }]
  },
  "filters": {
    "includeSpamTrash": false,
    "readStatus": "unread"
  }
}
```

**Qué hace**: Recibe todos los emails nuevos (no leídos) de la bandeja de entrada.

---

### Nodo 2: ¿From Turitop?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.from.value[0].address }}",
    "rightValue": "turitop.com",
    "operator": { "type": "string", "operation": "contains" }
  }]
}
```

**Salida SÍ** → Nodo 6 (Extraer Datos Turitop)  
**Salida NO** → Nodo 3

---

### Nodo 3: ¿From GetYourGuide?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.from.value[0].address }}",
    "rightValue": "getyourguide.com",
    "operator": { "type": "string", "operation": "contains" }
  }]
}
```

**Salida SÍ** → Nodo 15 (LLM Procesar)  
**Salida NO** → Nodo 4

---

### Nodo 4: ¿From Civitatis?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.from.value[0].address }}",
    "rightValue": "civitatis.com",
    "operator": { "type": "string", "operation": "contains" }
  }]
}
```

**Salida SÍ** → Nodo 15 (LLM Procesar)  
**Salida NO** → Nodo 5

---

### Nodo 5: ¿From Viator?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.from.value[0].address }}",
    "rightValue": "viator.com",
    "operator": { "type": "string", "operation": "contains" }
  }]
}
```

**Salida SÍ** → Nodo 15 (LLM Procesar)  
**Salida NO** → Nodo Final (No Operation — email no reconocido)

---

### Nodo 6: Extraer Datos Turitop

**Tipo**: `n8n-nodes-base.code`  
**Código JavaScript**:

```javascript
const items = $input.all();
const results = [];

for (const item of items) {
  const text = item.json.text || item.json.snippet || '';
  const subject = item.json.subject || item.json.Subject || '';
  const messageId = item.json.id;
  
  // === BOOKING ID ===
  const bookingMatch = text.match(/G193-\d{6}-\d+/);
  const bookingId = bookingMatch ? bookingMatch[0] : '';
  
  // === CUSTOMER NAME ===
  // Buscar después de "Customer:" o "Nombre:"
  let customerName = '';
  const customerPatterns = [
    /Customer:\s*\n\s*([^\n]+)/i,
    /Nombre:\s*([^\n]+)/i,
    /Customer name:\s*([^\n]+)/i
  ];
  for (const pat of customerPatterns) {
    const m = text.match(pat);
    if (m) { customerName = m[1].trim(); break; }
  }
  
  // === TOUR NAME y TOUR CODE ===
  let tourName = '';
  const tourPatterns = [
    /Service name:\s*\n?\s*([^\n]+)/i,
    /Actividad:\s*([^\n]+)/i
  ];
  for (const pat of tourPatterns) {
    const m = text.match(pat);
    if (m) { tourName = m[1].trim(); break; }
  }
  
  // Mapear tour name a código
  const TOUR_MAP = {
    'wine and tapas': 'WT',
    'wine tour': 'WT',
    'tapas tour tarde': 'TT',
    'tapas tour mañana': 'TM',
    'tapas & wine': 'TT',
    'curso de cata': 'CCATA',
    'ribera del duero': 'WTR',
    'wine and tapas walking': 'WT'
  };
  
  let tourCode = '';
  const tourLower = tourName.toLowerCase();
  for (const [key, code] of Object.entries(TOUR_MAP)) {
    if (tourLower.includes(key)) { tourCode = code; break; }
  }
  
  // === EVENT DATE ===
  let eventDate = null;
  const datePatterns = [
    /Event date:\s*\([^)]+\)\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i,
    /Fecha del evento:\s*\([^)]+\)\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i,
    /Fecha:\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i
  ];
  
  const months = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };
  
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      const monthNum = months[m[2].toLowerCase()];
      if (monthNum) {
        eventDate = `${m[3]}-${monthNum}-${m[1].padStart(2, '0')}`;
        break;
      }
    }
  }
  
  // === PEOPLE ===
  let people = 0;
  const peoplePatterns = [
    /Adult\s*\(13\+\)\s*(\d+)\s*x/i,
    /(\d+)\s*adultos/i,
    /(\d+)\s*adults/i,
    /Personas:\s*(\d+)/i
  ];
  for (const pat of peoplePatterns) {
    const m = text.match(pat);
    if (m) { people = parseInt(m[1]); break; }
  }
  
  // === CUSTOMER PHONE ===
  let phone = '';
  const phoneMatch = text.match(/☎\s*(\+[\d\s]+)/);
  if (phoneMatch) phone = phoneMatch[1].trim();
  
  // === TOUR CODE from booking_id (fallback) ===
  // G193-260607-4 → el tour code no está en el booking_id
  // Pero podemos inferir del asunto
  if (!tourCode) {
    const subjectLower = subject.toLowerCase();
    if (subjectLower.includes('wine') && subjectLower.includes('tapas')) tourCode = 'WT';
    else if (subjectLower.includes('tapas')) tourCode = 'TT';
    else if (subjectLower.includes('wine tour')) tourCode = 'WT';
  }
  
  results.push({
    json: {
      messageId,
      bookingId,
      customerName,
      tourName,
      tourCode,
      eventDate,
      people,
      phone,
      source: 'turitop',
      timestamp: new Date().toISOString()
    }
  });
}

return results;
```

---

### Nodo 7: Calcular Día-Actividad

**Tipo**: `n8n-nodes-base.code`  
**Código JavaScript**:

```javascript
const items = $input.all();
const results = [];

for (const item of items) {
  const data = item.json;
  
  if (!data.eventDate || !data.tourCode) {
    // Si no hay fecha o tour code, usar fallback
    results.push({
      json: {
        ...data,
        dayNumber: 0,
        labelName: `Turitop/sin-clasificar`,
        year: new Date().getFullYear().toString(),
        month: (new Date().getMonth() + 1).toString().padStart(2, '0')
      }
    });
    continue;
  }
  
  const dateParts = data.eventDate.split('-');
  const year = dateParts[0];
  const month = dateParts[1];
  const day = parseInt(dateParts[2]);
  
  // Calcular número de día desde el inicio del mes
  // Usar el día del mes directamente
  const dayNumber = day;
  
  // Formato de etiqueta: Turitop/{YYYY}/{MM}/{day_number}-{tour_code}
  const labelName = `Turitop/${year}/${month}/${dayNumber}-${data.tourCode}`;
  
  results.push({
    json: {
      ...data,
      dayNumber,
      labelName,
      year,
      month
    }
  });
}

return results;
```

---

### Nodo 8: Listar Gmail Labels

**Tipo**: `n8n-nodes-base.httpRequest`  
**Configuración**:
```json
{
  "method": "GET",
  "url": "https://gmail.googleapis.com/gmail/v1/users/me/labels",
  "authentication": "oAuth2"
}
```

**Qué hace**: Obtiene todas las etiquetas existentes de Gmail para verificar si la etiqueta destino ya existe.

---

### Nodo 9: ¿Label Existe?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.labels.find(l => l.name === $node['Calcular Día-Actividad'].json.labelName) }}",
    "rightValue": "",
    "operator": { "type": "string", "operation": "isNotEmpty" }
  }]
}
```

**Salida SÍ** → Nodo 11 (Aplicar Label — usar ID existente)  
**Salida NO** → Nodo 10 (Crear Label)

---

### Nodo 10: Crear Gmail Label

**Tipo**: `n8n-nodes-base.httpRequest`  
**Configuración**:
```json
{
  "method": "POST",
  "url": "https://gmail.googleapis.com/gmail/v1/users/me/labels",
  "authentication": "oAuth2",
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      { "name": "name", "value": "={{ $node['Calcular Día-Actividad'].json.labelName }}" },
      { "name": "labelListVisibility", "value": "labelShow" },
      { "name": "messageListVisibility", "value": "show" }
    ]
  }
}
```

---

### Nodo 11: Aplicar Label al Email

**Tipo**: `n8n-nodes-base.httpRequest`  
**Configuración**:
```json
{
  "method": "POST",
  "url": "=https://gmail.googleapis.com/gmail/v1/users/me/messages/{{ $node['Extraer Datos Turitop'].json.messageId }}/modify",
  "authentication": "oAuth2",
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      { "name": "addLabelIds", "value": "={{ $json.labelId }}" }
    ]
  }
}
```

**NOTA**: Este nodo también debe agregar la etiqueta "Recibidos" (INBOX) si no está presente, para mantener el email en la bandeja de entrada.

---

### Nodo 12: Guardar Reserva en Sheet

**Tipo**: `n8n-nodes-base.googleSheets`  
**Operación**: Append  
**Sheet ID**: (configurar con el ID real)  
**Datos**:
```
booking_id: {{ $node['Extraer Datos Turitop'].json.bookingId }}
customer_name: {{ $node['Extraer Datos Turitop'].json.customerName }}
tour_code: {{ $node['Extraer Datos Turitop'].json.tourCode }}
tour_name: {{ $node['Extraer Datos Turitop'].json.tourName }}
event_date: {{ $node['Extraer Datos Turitop'].json.eventDate }}
people: {{ $node['Extraer Datos Turitop'].json.people }}
status: active
version: 1
source: turitop
timestamp: {{ $node['Extraer Datos Turitop'].json.timestamp }}
```

---

### Nodo 13: ¿Hay Reserva Superseded?

**Tipo**: `n8n-nodes-base.googleSheets`  
**Operación**: Lookup  
**Sheet**: reservas  
**Condición de búsqueda**:
```
customer_name = '{{ $node['Extraer Datos Turitop'].json.customerName }}'
AND tour_code = '{{ $node['Extraer Datos Turitop'].json.tourCode }}'
AND status = 'superseded'
AND event_date BETWEEN '{{ $node['Extraer Datos Turitop'].json.eventDate - 1mes }}' AND '{{ $node['Extraer Datos Turitop'].json.eventDate + 7d }}'
```

**NOTA**: Google Sheets no tiene BETWEEN nativo. Se puede hacer con dos condiciones o con un nodo Code que filtre.

---

### Nodo 14: ¿Encontrado? (Superseded)

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.booking_id }}",
    "rightValue": "",
    "operator": { "type": "string", "operation": "isNotEmpty" }
  }]
}
```

**Salida SÍ** → Actualizar Calendar (httpRequest a webhook calendar-mod)  
**Salida NO** → No Operation (el flujo Calendar Sync ya maneja el webhook Turitop)

---

### Nodo 15: LLM Procesar Email (GYG/Civitatis/Viator)

**Tipo**: `@n8n/n8n-nodes-langchain.agent`  
**Modelo**: Google Gemini (configurar API key)  
**System Prompt**:

```
Eres un asistente que extrae información de emails de plataformas de reserva turística.

Analiza el email proporcionado y extrae SOLO los siguientes campos en formato JSON:

{
  "reference_code": "código de referencia de la plataforma (ej: GYGBLHN328YQ, A39368254)",
  "modification_type": "modify si es modificación, cancel si es cancelación, new si es reserva nueva",
  "customer_name": "nombre del cliente (si aparece en el email)",
  "tour_name": "nombre completo del tour o actividad",
  "tour_code": "código del tour: WT, TT, TM, WTR, CCATA (inferir del nombre)",
  "event_date_original": "fecha original del tour (si es modificación, formato YYYY-MM-DD)",
  "event_date_new": "fecha nueva del tour (si es modificación, formato YYYY-MM-DD)",
  "people": "número de personas (si aparece)",
  "turitop_code": "código Turitop si aparece en el email (formato G193-XXXXXX-X)",
  "language": "idioma del tour (si aparece)"
}

Reglas:
- Si el email dice "has been canceled" o "cancelada" → modification_type = "cancel"
- Si el email dice "has changed" o "modification" → modification_type = "modify"
- Si no puedes determinar un campo, ponlo como null
- tour_code se infiere del nombre del tour:
  - "Wine" o "Vinos" o "Tapas" → WT
  - "Tapas Tour" por la mañana → TM
  - "Tapas Tour" por la tarde → TT
  - "Ribera del Duero" → WTR
  - "Curso de Cata" o "Wine Tasting" → CCATA

Responde SOLO con el JSON, sin texto adicional.
```

**Input del usuario**: `{{ $json.text || $json.snippet }}`

---

### Nodo 16: Guardar Clasificación en Sheet

**Tipo**: `n8n-nodes-base.googleSheets`  
**Operación**: Append  
**Sheet**: clasificación_emails  
**Datos**:
```
message_id: {{ $json.messageId }}
source: gyg (o civitatis/viator según el remitente)
subject: {{ $json.subject }}
from: {{ $json.from }}
reference_code: {{ $json.reference_code }}
customer_name: {{ $json.customer_name }}
tour_code: {{ $json.tour_code }}
event_date: {{ $json.event_date_original || $json.event_date_new }}
people: {{ $json.people }}
modification_type: {{ $json.modification_type }}
old_date: {{ $json.event_date_original }}
new_date: {{ $json.event_date_new }}
status: classified
timestamp: {{ new Date().toISOString() }}
```

---

### Nodo 17: Lookup Reserva Activa

**Tipo**: `n8n-nodes-base.googleSheets`  
**Operación**: Lookup  
**Sheet**: reservas  
**Búsqueda**:
```
customer_name = '{{ $json.customer_name }}'
AND status = 'active'
```

**NOTA**: La búsqueda por tour_code y fecha se hace en el nodo Code siguiente, porque Google Sheets no soporta múltiples condiciones LIKE.

---

### Nodo 18: ¿Encontrado? (Reserva Activa)

**Tipo**: `n8n-nodes-base.if`  
**Condición**: Verificar que el lookup devolvió resultados.

**Salida SÍ** → Nodo 19  
**Salida NO** → Nodo 22 (Notificar Sin Reference)

---

### Nodo 19: ¿Tipo de Modificación?

**Tipo**: `n8n-nodes-base.if`  
**Condición**:
```json
{
  "conditions": [{
    "leftValue": "={{ $json.modification_type }}",
    "rightValue": "cancel",
    "operator": { "type": "string", "operation": "equals" }
  }]
}
```

**Salida CANCEL** → Nodo 20  
**Salida MODIFY** → Nodo 21

---

### Nodo 20: Marcar Cancelada + Eliminar Calendar

**Tipo**: `n8n-nodes-base.googleSheets` (Marcar) + `n8n-nodes-base.googleCalendar` (Eliminar)

**Acción 1 — Marcar en Sheet**:
```
UPDATE reservas 
SET status = 'cancelled' 
WHERE customer_name = '{{ $json.customer_name }}' 
AND tour_code = '{{ $json.tour_code }}'
AND status = 'active'
```

**Acción 2 — Eliminar evento Calendar**:
```
DELETE event/{calendar_event_id}
```

**Acción 3 — Notificar**:
```
Para: equipo@gourmetmadrid.com
Asunto: [CANCELACIÓN] Reserva {booking_id} cancelada via {source}
Contenido: "La reserva de {customer_name} para {tour_name} el {event_date} ha sido cancelada via {source}. Se ha eliminado el evento de Google Calendar."
```

---

### Nodo 21: Marcar Superseded + Notificar

**Tipo**: `n8n-nodes-base.googleSheets` + `n8n-nodes-base.gmail`

**Acción 1 — Marcar en Sheet**:
```
UPDATE reservas 
SET status = 'superseded', gyg_reference = '{{ $json.reference_code }}'
WHERE customer_name = '{{ $json.customer_name }}'
AND tour_code = '{{ $json.tour_code }}'
AND status = 'active'
```

**Acción 2 — Notificar**:
```
Para: equipo@gourmetmadrid.com
Asunto: [MODIFICACIÓN] Reserva {booking_id} — detected change via {source}
Contenido: "Se ha detectado una modificación de {source} para la reserva de {customer_name}. 
Código referencia: {reference_code}
Tipo: modificación de fecha
Fecha original: {old_date} → Nueva fecha: {new_date}
Se espera el 2º email de Turitop con la actualización.
Se actualizará Google Calendar automáticamente cuando llegue."
```

---

### Nodo 22: Notificar Sin Reference

**Tipo**: `n8n-nodes-base.gmail`

```
Para: equipo@gourmetmadrid.com
Asunto: [SIN REFERENCIA] Modificación de {source} sin reserva vinculada
Contenido: "No se ha encontrado una reserva activa vinculada a esta modificación.
Referencia: {reference_code}
Cliente: {customer_name}
Tour: {tour_name}
Acción requerida: Revisar manualmente y vincular la reserva."
```

---

## 6. Flujo Calendar Sync — Cambios

### Cambio 1: Añadir Webhook Calendar Mod

**Nuevo nodo al inicio del flujo** (antes de "Webhook Turitop"):

**Tipo**: `n8n-nodes-base.webhook`  
**Configuración**:
```json
{
  "path": "calendar-mod",
  "httpMethod": "POST",
  "responseMode": "responseNode"
}
```

**Conexión**: Este webhook se conecta al nodo "Responder OK" y luego al nodo "Parsear Datos" (el mismo que usa el webhook Turitop).

**Flujo modificado**:
```
Webhook Turitop ──┐
                  ├──► Responder OK ──► Parsear Datos ──► [resto del flujo]
Webhook Calendar Mod ─┘
```

---

### Cambio 2: Modificar Nodo "Calcular Cupos"

**Código actual** (problemático):
```javascript
case 'modify':
  updatedTotal = currentTotal; // ❌ No hace nada
  break;
```

**Código nuevo** (propuesto):
```javascript
case 'modify':
  // Para modify, el nuevo total viene directamente del email actualizado
  // Porque este webhook viene del flujo de Clasificación (calendar-mod)
  // y ya tiene los datos correctos del 2º email Turitop
  updatedTotal = newPersonas;
  break;
```

**Explicación**: Cuando el flujo de Clasificación detecta un reemplazo, envía los datos del 2º email Turitop al webhook `calendar-mod`. El 2º email ya tiene el número de personas correcto (ej: 5 en lugar de 4). Por lo tanto, `newPersonas` ya es el total correcto.

---

### Cambio 3: Añadir Detección de Duplicados

**En el nodo "Evaluar Lookup"**, añadir verificación:

```javascript
// Verificar si ya existe una reserva con el mismo booking_id
const existingBooking = items.find(i => i.json.booking_id === parseData.bookingId);

if (existingBooking && existingBooking.json.status === 'active') {
  // Ya existe una reserva activa con este booking_id
  // Esto es un duplicado — no procesar
  return [{
    json: {
      ...parseData,
      esDuplicado: true,
      mensaje: `Duplicado detectado: booking_id ${parseData.bookingId} ya existe`
    }
  }];
}
```

---

## 7. Configuración de Servicios

### Gmail API

1. Ir a Google Cloud Console → APIs & Services → Gmail API
2. Habilitar la API
3. Crear credenciales OAuth 2.0
4. En n8n: Settings → Credentials → Google OAuth2
5. Scopes necesarios:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/gmail.readonly`

### Google Sheets

1. Usar la misma credencial OAuth de Gmail o crear separada
2. Scopes necesarios:
   - `https://www.googleapis.com/auth/spreadsheets`
3. Compartir los Sheets con el email del servicio OAuth

### Google Calendar

1. Misma credencial OAuth
2. Scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`

### Google Gemini (para LLM)

1. Ir a Google AI Studio (aistudio.google.com)
2. Crear API key
3. En n8n: Settings → Credentials → Google Gemini API
4. Usar modelo: `gemini-1.5-flash` (rápido y barato) o `gemini-1.5-pro` (mejor calidad)

### Evolution API (para WhatsApp — opcional)

1. URL base del servidor Evolution API
2. Token de autenticación
3. En n8n: Settings → Credentials → HTTP Header Auth

---

## 8. Testing

### Test 1: Clasificación Turitop

**Input**: Enviar email de prueba con formato Turitop:
```
De: no-reply@turitop.com
Asunto: Your booking details - Ruta de Vinos y Tapas

Booking number: G193-260610-1
Service name: Wine and Tapas Tour
Event date: (Wednesday) 10 June 2026 19:30
Adult (13+) 2 x 85EUR
TOTAL 170EUR
Status: confirmed
Customer:
María García
+34612345678
```

**Esperado**:
- Gmail label creada: `Turitop/2026/06/10-WT`
- Email con label aplicada (visible en inbox)
- Sheet "reservas": nuevo registro con booking_id=G193-260610-1, status=active

---

### Test 2: Modificación GYG

**Input**: Email de GetYourGuide:
```
De: do-not-reply@notification.getyourguide.com
Asunto: Booking detail change - GYGTEST123

Booking reference GYGTEST123
Date New June 15, 2026 at 7:00 PM
June 10, 2026 at 12:00 PM
Number of participants 2
```

**Esperado**:
- LLM extrae: reference_code=GYGTEST123, modification_type=modify, old_date=2026-06-10, new_date=2026-06-15, people=2
- Sheet "clasificación_emails": nuevo registro
- Sheet "reservas": reserva original (si existe) marcada como "superseded"
- Email de notificación al equipo

---

### Test 3: Cadena Completa (Turitop → GYG → Turitop)

**Paso 1**: Enviar email Turitop (reserva original)
```
Booking: G193-260610-2 | Wine Tour | 12 jun | 4 personas | Pedro López
```
**Verificar**: Sheet reserva activa, Calendar evento "WT 4"

**Paso 2**: Enviar email GYG (modificación)
```
Reference: GYGTEST456 | 4→5 personas | Pedro López
```
**Verificar**: Reserva original marcada como "superseded", email notificación

**Paso 3**: Enviar email Turitop (actualización)
```
Booking: G193-260610-2 | Wine Tour | 12 jun | 5 personas | Pedro López
```
**Verificar**: Calendar actualizado a "WT 5", nueva reserva marcada como "active"

---

### Test 4: Cancelación Civitatis

**Input**: Email de Civitatis:
```
De: notificaciones@civitatis.com
Asunto: Reserva cancelada A39399999: Tour de tapas y vinos

Actividad: Tour de tapas y vinos por Madrid
Número de reserva: A39399999
Referencia externa: C731-G193-260610-3
Fecha: 15 de julio de 2026
Personas: 3 adultos
Cliente: Ana Martínez
```

**Esperado**:
- LLM extrae: reference_code=A39399999, turitop_code=G193-260610-3, modification_type=cancel
- Reserva vinculada marcada como "cancelled"
- Evento Calendar eliminado
- Email de notificación

---

## 9. Deploy

### Paso 1: Importar workflows a n8n

1. Abrir n8n production
2. Importar `Clasificación Emails v2.json` (nuevo flujo)
3. Importar `Turitop → Calendar Sync + Gestión Guías.json` (modificado)
4. Verificar que todas las credenciales están configuradas

### Paso 2: Configurar URLs de webhooks

En el flujo EXT1 (Contactar Guía), actualizar:
```
REPLACE_CON_TU_N8N_URL → https://tu-n8n-url.com/webhook
```

Los webhooks serán:
- `https://tu-n8n-url.com/webhook/turitop-webhook` (ya existente)
- `https://tu-n8n-url.com/webhook/calendar-mod` (nuevo)
- `https://tu-n8n-url.com/webhook/contactar-guia` (ya existente)
- `https://tu-n8n-url.com/webhook/respuesta-guia` (ya existente)

### Paso 3: Activar flujos

1. Activar `Clasificación Emails v2`
2. Activar `Calendar Sync + Gestión Guías`
3. Verificar que los triggers están funcionando

### Paso 4: Monitoreo inicial

1. Revisar los primeros 10-20 emails procesados
2. Verificar que las Gmail labels se crean correctamente
3. Verificar que los Sheet se actualizan
4. Verificar que las notificaciones llegan al equipo

---

## Apéndice: Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| Email no se clasifica | From no contiene "turitop.com" | Verificar el filtro, puede ser "turitop.com" vs "mail.turitop.com" |
| Gmail label no se crea | Permisos OAuth insuficientes | Verificar scopes: gmail.modify, gmail.labels |
| LLM no extrae datos | Email en formato inesperado | Ajustar el system prompt o añadir más ejemplos |
| Reserva no se vincula | customer_name no coincide | Verificar ortografía, puede haber variaciones |
| Calendar no se actualiza | webhook calendar-mod no recibe datos | Verificar que el flujo de Clasificación está conectado al webhook |
| Duplicados en Sheet | No hay detección de duplicados | Añadir verificación de booking_id antes de append |

---

*Documento generado el 10 de junio de 2026. Actualizado con análisis de emails de muestra y flujos n8n existentes.*
