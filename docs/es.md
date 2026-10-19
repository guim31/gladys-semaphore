# Semaphore UI

[Semaphore UI](https://semaphoreui.com/) es una interfaz web libre para
ejecutar playbooks de Ansible, código Terraform/OpenTofu y scripts de shell o
Python: cada «plantilla» (template) es un trabajo que se lanza con un clic y
cuyo resultado se sigue. Esta integración trae a Gladys las plantillas **que
usted permita**: cada una se convierte en un dispositivo con el estado de su
última tarea, una escena puede **lanzar una plantilla** (y esperar a que
termine) o **detener** su tarea en curso, las escenas pueden reaccionar cuando
una tarea **termina bien** o **falla**, y un widget del panel muestra su último
estado con un botón **Lanzar**.

Probada con un Semaphore UI 2.19 real (Docker, SQLite, playbooks de Ansible);
todavía no con una instancia real de Gladys: sus comentarios son bienvenidos
en [las issues](https://github.com/guim31/gladys-semaphore/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Semaphore UI 2.x, accesible desde la máquina de Gladys.
- Un token de API de un usuario de Semaphore que pueda lanzar las plantillas
  (rol «Task Runner» o superior en su proyecto).

Lanzar una plantilla ejecuta código en sus máquinas. Por eso no se puede lanzar
nada desde Gladys mientras usted no haya escrito su número en la lista de
plantillas permitidas, y por eso la integración nunca lee la salida de las
tareas (los registros de Ansible pueden contener secretos): solo su estado y
su duración.

En cada actualización (cada minuto por defecto), la integración lee la lista de
proyectos y después las plantillas de los proyectos que contienen una
plantilla permitida; cada 5 segundos mientras una tarea de una plantilla
permitida está en curso. Semaphore no limita las peticiones a su API.

## Primeros pasos

### 1. Crear un token de API

En Semaphore, abra el menú de usuario (abajo a la izquierda) → **API tokens** y
cree un token. En una versión sin esta pantalla, la API crea uno:
`POST /api/user/tokens` con la sesión iniciada. El token actúa con los permisos
de su usuario: un usuario dedicado, miembro solo de los proyectos afectados,
limita lo que Gladys puede hacer.

### 2. Configurar la integración

En Gladys, **Integraciones → Semaphore UI → Configuración**:

- **Dirección de Semaphore**: la dirección con la que abre Semaphore, p. ej.
  `http://192.168.1.2:3000` (a una dirección IP sola se le añade el puerto
  3000).
- **Token de API**: el token del paso 1.
- **Idioma de los nombres**: francés por defecto; fija los nombres de las
  funciones al añadir un dispositivo, los estados y los resultados de escena.

Guarde y pulse **Probar la conexión**: lista todas las plantillas que ve el
token, con su número, su proyecto y su nombre, p. ej.
`#3 Home lab: Update servers`.

### 3. Permitir plantillas

Escriba en **Plantillas permitidas (números)** los números de las plantillas
que Gladys puede seguir y lanzar, separados por comas: `3, 7`. El número
también aparece en la dirección de una plantilla en Semaphore
(`…/project/1/templates/3`). Vacío: no se sigue nada, no se puede lanzar nada.

### 4. Añadir los dispositivos

En la pestaña **Descubrir**, añada las plantillas que desee como dispositivos.
Los disparadores, las acciones y el widget funcionan para toda plantilla
permitida; los dispositivos aportan los estados y el historial.

## Los dispositivos

Un dispositivo por plantilla permitida, con su nombre:

| Función                     | Significado                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| Última tarea                | estado de la última tarea: Correcto, Fallido, En ejecución, Detenido, En espera… |
| Última tarea correcta       | 1 si la última tarea terminada fue correcta, 0 si falló o se detuvo              |
| En ejecución                | 1 mientras una tarea de la plantilla está en curso                               |
| Último inicio               | inicio de la última tarea (día/mes horas:minutos, zona horaria de Gladys)        |
| Duración de la última tarea | duración de la última tarea terminada, en segundos                               |

El dispositivo no tiene ningún mando: lanzar Ansible no es un interruptor al
que deban llegar un asistente de voz o un toque por error. Una plantilla se
lanza desde una escena o desde el widget, que pide una confirmación.

## Panel

El widget **Plantillas de Semaphore** lista las plantillas permitidas (o las
elegidas en sus ajustes), primero las fallidas y luego las que están en curso:
último estado, hora de inicio, duración. Bajo la lista, un botón por plantilla
(las cinco primeras): **Lanzar**, o **Detener** mientras una tarea está en
curso. Gladys pide una confirmación antes de enviarlo. **Actualizar** vuelve a
leer Semaphore.

## Escenas

### Disparadores

- **Una tarea de Semaphore termina bien**: una tarea de una plantilla
  permitida termina correctamente.
- **Una tarea de Semaphore falla**: una tarea de una plantilla permitida
  termina en error.

Ambos pueden limitarse a algunas plantillas, y dan el nombre de la plantilla,
el proyecto, el número de la tarea y la duración en segundos. Una tarea
detenida no es ni lo uno ni lo otro. Las tareas lanzadas desde el propio
Semaphore, una programación u otra herramienta también cuentan. La primera
lectura tras la instalación no anuncia nada del pasado; una tarea que terminó
durante un reinicio de Gladys o de la integración se anuncia una vez.

### Acciones

- **Lanzar una plantilla de Semaphore**: lanza una plantilla permitida.
  **Variables adicionales (JSON)** es opcional: un objeto JSON pasado a la
  tarea, p. ej. `{"target": "web1"}` (se pueden insertar valores de la escena).
  Con **Esperar al final (90 s como máximo)**, la escena espera a la tarea y
  las acciones siguientes reciben su resultado. Salidas: número de la tarea,
  terminada, correcta, estado, duración (s).
- **Detener una tarea de Semaphore**: detiene la tarea en curso de una
  plantilla permitida. Salidas: se detuvo una tarea (sí/no), número de la
  tarea.

Ambas rechazan una plantilla que no esté en la lista de plantillas permitidas,
aunque su dispositivo siga existiendo en Gladys.

### Ideas de escenas

- Cada domingo a las 3:00, lanzar «Update servers»; cuando **Una tarea de
  Semaphore falla**, enviar un mensaje de Telegram: «{{triggerEvent.data.template}}
  ha fallado tras {{triggerEvent.data.duration}} s».
- Al salir de casa, lanzar «Nightly backup» con **Esperar al final** y avisarle
  solo si «Correcta» es falso.
- Un botón en la tableta de pared: el widget, con «Reiniciar el servidor
  multimedia» permitido.

## Solución de problemas

- **Token de API rechazado**: el token se eliminó o se copió mal; cree uno
  nuevo.
- **Rechazado por Semaphore: este usuario no puede lanzar tareas en el
  proyecto**: dé al usuario del token el rol «Task Runner» (o superior) en el
  proyecto.
- **Permitidas pero no encontradas**: el número es incorrecto, la plantilla se
  eliminó, o el usuario del token no es miembro de su proyecto. **Probar la
  conexión** lista lo que ve el token.
- **No hay ninguna API de Semaphore en esta dirección**: compruebe la dirección
  y el puerto; detrás de un proxy inverso, incluya su ruta.
- **La dirección redirige**: introduzca la dirección `https://`.
- Una tarea no aparece enseguida: la integración lee Semaphore cada minuto
  (configurable), cada 5 segundos mientras una tarea está en curso.

## Límites

- Solo se lee la última tarea de cada plantilla: si dos tareas de la misma
  plantilla terminan entre dos lecturas, solo la última activa un disparador.
- La salida de las tareas nunca se lee ni se muestra, a propósito.
- «Esperar al final» espera 90 s como máximo (el límite de una acción de escena
  en Gladys); una tarea más larga continúa, y los disparadores avisan de su
  final.
- Las tareas de Terraform que esperan una confirmación muestran «Por
  confirmar»; la confirmación se hace en Semaphore.
- Desarrollada y probada con Semaphore UI 2.19.17; las versiones 2.x anteriores
  deberían funcionar (misma API), sin probar.
