# Panel de Obsolescencia de Repositorios

Panel que escanea repositorios de GitHub (una cuenta personal o una
organización con cientos de repos) y reporta, por repositorio:

1. Nombre del repositorio
2. Lenguaje de programación
3. Versión del lenguaje detectada
4. Si esa versión está próxima a perder soporte oficial (EOL) o ya lo perdió
5. Versión recomendada a la que migrar (la más reciente que siga soportada,
   priorizando LTS cuando el lenguaje lo maneja)
6. Vulnerabilidades abiertas en sus dependencias (GitHub Advisory Database /
   Dependabot)

El escaneo corre solo, cada viernes, vía GitHub Actions, y los resultados se
publican en una página estática (GitHub Pages) sin necesidad de servidor
propio.

Lenguajes soportados en esta versión: JavaScript/TypeScript (Node),
Python, Java, Go y .NET (C#).

## 1. Crear el token de escaneo

1. Genera un Personal Access Token (fine-grained o classic) en
   `Settings → Developer settings → Personal access tokens`.
2. Scopes necesarios:
   - Classic: `repo` (lectura) y `security_events` (lectura de Dependabot
     alerts).
   - Fine-grained: permisos de "Contents" (Read) y "Dependabot alerts"
     (Read) sobre los repos/organización a escanear.
3. Si vas a escanear una organización, el token debe pertenecer a una
   cuenta con acceso de lectura a esa organización (y la organización debe
   permitir el acceso de PATs de terceros si tiene esa restricción activada).
4. En este repositorio de GitHub, ve a `Settings → Secrets and variables →
   Actions` y crea el secreto `SCAN_TOKEN` con el valor del token.

## 2. Configurar qué escanear

Edita [`config.yml`](config.yml):

```yaml
targets:
  - owner: tu-usuario
    type: user          # repos propios (incluye privados)
  - owner: tu-organizacion
    type: org           # repos de una organización
```

Puedes agregar tantos `targets` como necesites (cuenta personal +
varias organizaciones a la vez). El panel los mezcla en una sola tabla, con
un filtro por cuenta/organización.

## 3. Activar GitHub Pages

En `Settings → Pages`, selecciona como fuente la rama `main` y la carpeta
`/docs`. La página quedará disponible en
`https://<usuario-u-org>.github.io/<repo>/`.

## 4. Ejecutar el primer escaneo

- Automático: el workflow `Escaneo de obsolescencia` corre todos los
  viernes a las 06:00 UTC.
- Manual: en la pestaña `Actions` del repo, entra al workflow "Escaneo de
  obsolescencia" y usa "Run workflow".

Cada corrida sobreescribe y comitea `docs/data/report.json`, que es lo que
lee la página estática.

## Cómo se detecta cada dato

- **Lenguaje principal**: API de GitHub (`/repos/{owner}/{repo}/languages`).
- **Versión del lenguaje**: se busca el archivo de manifiesto típico de
  cada lenguaje (`package.json`/`.nvmrc`, `pyproject.toml`/`runtime.txt`,
  `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`). Si el repo no declara una
  versión explícita, se muestra como "No detectada".
- **EOL / soporte**: la versión detectada se compara contra
  [endoflife.date](https://endoflife.date) para saber si está vigente,
  próxima a vencer (por defecto, dentro de 180 días — configurable en
  `config.yml` con `eolNearThresholdDays`) o ya sin soporte.
- **Versión recomendada**: también contra endoflife.date, se toma el ciclo
  soportado más reciente del lenguaje; si el lenguaje maneja versiones LTS
  (Node.js, .NET), se prioriza el LTS vigente más reciente en vez de una
  versión "current" de vida más corta. Si la versión actual del repo ya
  coincide con la recomendada, se marca como "al día".
- **Vulnerabilidades**: se consulta la API de Dependabot Alerts del repo. Si
  Dependabot no está habilitado en un repo, esa columna muestra "No
  disponible" (hay que activar "Dependabot alerts" en `Settings → Security`
  de ese repo para que aparezca).

## Reutilizar en otra organización

Este repositorio está pensado para reutilizarse tal cual: haz un fork o
usa "Use this template", cambia `config.yml` con el owner/org deseado,
crea el secreto `SCAN_TOKEN` con un token que tenga acceso a esos repos, y
activa Pages. No requiere tocar el código.

## Desarrollo / prueba local

```bash
cd scripts
npm install
SCAN_TOKEN=ghp_xxx npm run scan   # genera docs/data/report.json
npx serve ../docs                 # o cualquier servidor estático
```
