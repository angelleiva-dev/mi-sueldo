# 💰 Mi Sueldo

App para ordenar tu sueldo desde el teléfono: registra ingresos y gastos al instante, reparte tu sueldo con la regla 50/30/20, controla pagos fijos y avanza en tus metas de ahorro.

**Tus datos se guardan solo en tu dispositivo** (almacenamiento local del navegador). No hay servidor, cuentas ni nada que se suba a internet. La app funciona sin conexión.

## 📲 Instalarla en el teléfono

1. Abre en el teléfono: **https://angelleiva-dev.github.io/mi-sueldo/**
2. Instálala:
   - **Android (Chrome):** menú ⋮ → *Agregar a la pantalla principal* / *Instalar app*.
   - **iPhone (Safari):** botón Compartir → *Agregar a inicio*.
3. Ábrela desde el ícono. En Android, manteniendo presionado el ícono aparecen atajos para **Registrar gasto** y **Registrar ingreso**.

> Los datos quedan en el navegador donde la instalaste. Si usas la app en el teléfono y en el computador, cada uno tiene sus propios datos; para moverlos usa **Ajustes → Respaldo / Restaurar**.

## ✨ Qué incluye

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Cuánto *puedes gastar hoy* (disponible ÷ días que quedan, descontando pagos fijos pendientes y el ahorro planeado), ingresos, gastos, ahorro, distribución 50/30/20, pagos fijos del mes, gráfico de en qué se va la plata e historial de 6 periodos. |
| **Botón +** | Registro rápido: monto, categoría (un toque), fecha, medio de pago (débito, crédito, efectivo, transferencia) y nota. |
| **Movimientos** | Lista por día, búsqueda, filtro por ingresos/gastos, editar o eliminar tocando un movimiento. |
| **Presupuesto** | Topes por categoría con avisos al 85% y al pasarte, botón para *sugerir topes automáticamente* según tu regla e historial, y pagos fijos mensuales (arriendo, plan, créditos…) con botón *Pagar*. |
| **Metas** | Metas de ahorro con monto objetivo y fecha límite; calcula cuánto apartar al mes. Aportes y retiros quedan registrados. |
| **Ajustes** | Sueldo líquido, **día de pago** (el periodo va de pago a pago), moneda, regla de distribución (50/30/20, 60/20/20, 70/20/10 o la tuya), categorías editables, respaldo `.json`, exportación a Excel `.csv` y borrado de datos. |

## 🔒 Respaldo

Como todo vive en tu teléfono, si borras los datos del navegador o cambias de teléfono se pierden. Descarga un respaldo en **Ajustes → Respaldo (.json)** de vez en cuando (la app te lo recuerda cada 30 días) y guárdalo en Drive o donde prefieras. Con **Restaurar** lo cargas en otro dispositivo.

## 🛠️ Técnico

- HTML + CSS + JavaScript puro, sin dependencias ni compilación.
- PWA con `manifest.webmanifest` y `sw.js` (funciona offline).
- Datos en `localStorage` (clave `mi-sueldo:v1`), con solicitud de almacenamiento persistente.
- Publicada con GitHub Pages desde la rama `main`.

Para probar en local: `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`.

Si modificas archivos, sube la versión de `CACHE` en `sw.js` para que los teléfonos descarguen la actualización.
