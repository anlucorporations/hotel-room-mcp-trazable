Aquí tienes la \*\*Propuesta Técnica Formal\*\* consolidada, diseñada específicamente para ser entregada a un equipo de ingeniería de software. Esta propuesta integra el stack de "herramientas ganadoras" seleccionado, definiendo con precisión los requisitos, la arquitectura y el plan de ejecución para el despliegue en tu cuenta de GCP.

\---

\# 📄 Propuesta Técnica: Asistente Virtual IA Híbrido (MCP \+ RAG) para Hotel Marina del Sol

\#\# 1\. Resumen Ejecutivo  
El objetivo es evolucionar el servidor MCP actual del repositorio \`hotel-room-mcp-trazable\` hacia un \*\*Asistente Virtual de IA conversacional\*\* capaz de gestionar reservas, responder dudas operativas y guiar al huésped. Para lograr la máxima fiabilidad, seguridad y eficiencia de costos, se adoptará una \*\*arquitectura híbrida\*\*:   
\- \*\*MCP (Model Context Protocol)\*\* para datos estructurados y transaccionales en tiempo real (blockchain, disponibilidad).  
\- \*\*RAG (Retrieval-Augmented Generation)\*\* sobre PostgreSQL para datos no estructurados (manuales de usuario, protocolos, servicios).  
\- \*\*Google Cloud Platform (GCP)\*\* como infraestructura base, utilizando modelos de código abierto gestionados (Vertex AI) para optimizar la relación capacidad-coste.

\---

\#\# 2\. Stack Tecnológico Ganador (Arquitectura de Referencia)

| Capa | Tecnología Elegida | Justificación Técnica |  
| :--- | :--- | :--- |  
| \*\*Modelo de Lenguaje (LLM)\*\* | \*\*Meta Llama 3 8B Instruct\*\* (vía Vertex AI Model Garden) | Líder en \*Tool Calling\* fiable, excelente soporte multilingüe (ES/EN/RU) y costo \*pay-as-you-go\* sin gestionar GPUs. |  
| \*\*Orquestación de IA\*\* | \*\*Vercel AI SDK\*\* (sobre Next.js App Router) | Soporte nativo para \*Tool Calling\* (funciones), streaming de respuestas y manejo de estado de conversación. |  
| \*\*Datos Estructurados\*\* | \*\*Servidor MCP\*\* (Node.js/TypeScript existente) | Mantiene la separación de responsabilidades: el MCP valida y prepara datos on-chain, nunca firma. |  
| \*\*Base de Conocimiento (RAG)\*\*| \*\*PostgreSQL 18\*\* \+ extensión \*\*\`pgvector\`\*\* | Reutiliza la infraestructura de BD existente. Evita introducir bases de datos vectoriales nuevas (como Pinecone), reduciendo costos y complejidad. |  
| \*\*Infraestructura (GCP)\*\* | \*\*Cloud Run\*\*, \*\*Cloud SQL\*\*, \*\*Secret Manager\*\* | Escalado a cero (ahorro de costos), seguridad nativa y cumplimiento de los patrones de despliegue ya definidos en \`infra/gcp\`. |  
| \*\*CI/CD\*\* | \*\*GitLab CI\*\* \+ \*\*Workload Identity Federation (WIF)\*\* | Despliegue seguro a GCP sin necesidad de almacenar claves JSON de cuentas de servicio en el repositorio. |

\---

\#\# 3\. Requisitos Funcionales (RF)

| ID | Descripción | Prioridad |  
| :--- | :--- | :--- |  
| \*\*RF-01\*\* | El asistente debe responder preguntas sobre protocolos, servicios, ubicación y reglas del hotel consultando la base de conocimientos RAG (ej. \*"¿Qué hago si el huésped no tiene el QR?"\*). | Alta |  
| \*\*RF-02\*\* | El asistente debe consultar disponibilidad de habitaciones en tiempo real utilizando la herramienta MCP \`check\_availability\`. | Alta |  
| \*\*RF-03\*\* | El asistente debe guiar un flujo de reserva conversacional: solicitar fechas/tipo → verificar disponibilidad → solicitar dirección de wallet → generar payload con \`build\_purchase\_tx\`. | Alta |  
| \*\*RF-04\*\* | El asistente debe detectar y responder en el mismo idioma de la consulta del usuario (Español, Inglés o Ruso), manteniendo la coherencia del contexto. | Alta |  
| \*\*RF-05\*\* | El sistema debe citar la fuente de la información cuando extraiga datos de los manuales (ej. \*"Según el Manual de Recepción, sección 5..."\*). | Media |

\---

\#\# 4\. Requisitos No Funcionales (RNF)

| ID | Descripción | Criterio de Aceptación |  
| :--- | :--- | :--- |  
| \*\*RNF-01\*\* | \*\*Latencia\*\*: El tiempo de respuesta end-to-end (incluyendo embedding, búsqueda vectorial y generación LLM) debe ser \< 2.5 segundos (p95). | Monitoreo en Cloud Run / APM. |  
| \*\*RNF-02\*\* | \*\*Eficiencia de Costos\*\*: La infraestructura debe escalar a cero instancias cuando no haya tráfico. El costo mensual del stack de IA no debe superar los \$50 USD en fase de validación. | Revisión de facturación de GCP. |  
| \*\*RNF-03\*\* | \*\*Seguridad de Datos\*\*: Prohibido almacenar o registrar PII (DNI, nombres, teléfonos) en los logs del asistente o en la base de datos vectorial. | Auditoría de logs y sanitización de inputs. |  
| \*\*RNF-04\*\* | \*\*Confinamiento del MCP\*\*: El servidor MCP operará estrictamente en modo \*read-only\* para consultas. La herramienta \`build\_purchase\_tx\` solo preparará el payload; la firma se delegará 100% al cliente (MetaMask/WalletConnect). | Pruebas de inyección de prompts y revisión de código. |

\---

\#\# 5\. Requisitos Técnicos (RT) \- Especificaciones para Ingeniería

\#\#\# RT-01: Esquema de Base de Datos para RAG  
Se debe ejecutar la siguiente migración en la instancia de Cloud SQL (PostgreSQL 18\) para albergar los manuales:  
\`\`\`sql  
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE hotel\_knowledge\_base (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    source\_file VARCHAR(255) NOT NULL,       \-- ej: 'manual-recepcion.md'  
    section\_heading VARCHAR(255),            \-- ej: '5. Check-in en contingencia'  
    content TEXT NOT NULL,                   \-- El fragmento de texto (chunk)  
    embedding vector(1536),                  \-- Dimensión estándar de text-embedding-3-small  
    metadata JSONB,                          \-- ej: {"audience": "recepcionista", "lang": "es"}  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP  
);

\-- Índice HNSW para búsquedas de similitud de alta velocidad  
CREATE INDEX idx\_knowledge\_base\_embedding ON hotel\_knowledge\_base USING hnsw (embedding vector\_cosine\_ops);  
\`\`\`

\#\#\# RT-02: Definición de Nuevas Herramientas MCP  
El servidor MCP (\`apps/mcp/src\`) debe exponer las siguientes herramientas con esquemas JSON estrictos:

1\. \*\*\`search\_hotel\_manuals\`\*\* (Para el RAG):  
   \`\`\`json  
   {  
     "name": "search\_hotel\_manuals",  
     "description": "Busca protocolos, reglas, servicios o información estática del hotel en los manuales oficiales.",  
     "inputSchema": {  
       "type": "object",  
       "properties": {  
         "query": { "type": "string", "description": "La pregunta o concepto a buscar." },  
         "target\_audience": { "type": "string", "enum": \["cliente", "recepcionista", "propietario"\] }  
       },  
       "required": \["query"\]  
     }  
   }  
   \`\`\`  
2\. \*\*\`get\_room\_details\`\*\*: Devuelve descripción, capacidad y precio base de \`simple\`, \`doble\` o \`suite\`.  
3\. \*\*\`get\_location\_and\_access\`\*\*: Devuelve dirección, coordenadas y opciones de transporte a Alicante.

\#\#\# RT-03: Pipeline de Ingesta de Datos (ETL)  
Se desarrollará un script (\`scripts/ingest-manuals.ts\`) que:  
1\. Lea los archivos \`.md\` de la carpeta \`docs/\`.  
2\. Realice \*chunking\* jerárquico (respetando los encabezados \`\#\#\` y \`\#\#\#\` para no perder contexto).  
3\. Genere embeddings usando la API de OpenAI (\`text-embedding-3-small\`) o un modelo local de HuggingFace.  
4\. Inserte los resultados en la tabla \`hotel\_knowledge\_base\`.  
\*Este script se ejecutará manualmente en el despliegue inicial y se podrá vincular a un webhook de GitLab para actualizaciones futuras.\*

\---

\#\# 6\. Plan de Desarrollo por Fases (4 Semanas)

| Fase | Duración | Actividades Clave | Entregable |  
| :--- | :--- | :--- | :--- |  
| \*\*Fase 1: Infraestructura GCP\*\* | Semana 1 | \- Aprovisionar Cloud SQL (con \`pgvector\`), Secret Manager y Artifact Registry.\<br\>- Configurar WIF en GitLab CI para despliegue sin claves.\<br\>- Ejecutar migraciones de BD. | Entorno GCP listo y pipeline de CI/CD funcionando. |  
| \*\*Fase 2: RAG y MCP\*\* | Semana 2 | \- Desarrollar y ejecutar el script de ingesta de manuales (\`ingest-manuals.ts\`).\<br\>- Implementar las nuevas herramientas (\`search\_hotel\_manuals\`, \`get\_room\_details\`) en el servidor MCP.\<br\>- Pruebas unitarias (Vitest) de las herramientas. | Servidor MCP actualizado y base de datos vectorial poblada. |  
| \*\*Fase 3: Orquestación IA\*\* | Semana 3 | \- Configurar Vertex AI (Llama 3 8B) en GCP.\<br\>- Desarrollar \`POST /api/assistant\` en Next.js usando Vercel AI SDK con soporte de \*Tool Calling\*.\<br\>- Implementar \*System Prompt\* estricto con reglas de citación y multilingüismo. | API del asistente funcional, capaz de alternar entre RAG y MCP. |  
| \*\*Fase 4: UI, Pruebas y Despliegue\*\* | Semana 4 | \- Mejorar la UI de \`/asistente\` (streaming de texto, indicadores de "pensando/buscando").\<br\>- Pruebas E2E (Playwright) de flujos de reserva y consultas de soporte.\<br\>- Despliegue a producción en Cloud Run. | Asistente en producción, documentado y monitoreado. |

\---

\#\# 7\. Análisis de Costos Estimado (GCP \- Fase de Validación)

\*Basado en un tráfico moderado de \~1,000 interacciones de asistentes por mes.\*

| Recurso GCP | Configuración | Costo Mensual Estimado |  
| :--- | :--- | :--- |  
| \*\*Cloud SQL\*\* | PostgreSQL 18, \`db-g1-small\` (Shared Core, 1.7GB RAM) | \~\$15 \- \$20 USD |  
| \*\*Vertex AI\*\* | Llama 3 8B Instruct (Pay-as-you-go: \~$0.0003/1Kinput,~$0.0006/1K output) | \~\$10 \- \$25 USD \*(depende del tamaño del contexto RAG)\* |  
| \*\*Cloud Run\*\* | Servicio \`apps/web\` y \`apps/mcp\` (Escalado a 0 instancias, 1 vCPU, 512MB) | \~\$5 \- \$10 USD |  
| \*\*Secret Manager / Artifact Registry\*\* | Almacenamiento mínimo | \~\$2 \- \$5 USD |  
| \*\*TOTAL ESTIMADO\*\* | | \*\*\~\$32 \- \$60 USD / mes\*\* |

\*Nota: Este modelo de costos es altamente escalable. Si el tráfico aumenta a 10,000 consultas/mes, el costo de Vertex AI y Cloud Run crecerá linealmente, pero seguirá siendo una fracción del costo de mantener una GPU dedicada 24/7 (\~\$400+/mes).\*

\---

\#\# 8\. Próximos Pasos Inmediatos (Call to Action)

Para dar inicio al proyecto, se requiere la aprobación del equipo de ingeniería en los siguientes puntos:

1\. \*\*Acceso a GCP\*\*: Otorgar permisos de \`Editor\` o \`Owner\` en el proyecto de GCP al ingeniero líder para la configuración inicial de APIs y WIF.  
2\. \*\*Aprobación del Esquema RT-01\*\*: Validar la creación de la tabla \`hotel\_knowledge\_base\` y la extensión \`pgvector\` en la base de datos de producción/staging.  
3\. \*\*Selección de Proveedor de Embeddings\*\*: Confirmar el uso de \`text-embedding-3-small\` (OpenAI, bajo costo y alta calidad) o un modelo open-source local (ej. \`nomic-embed-text\`) si existen restricciones estrictas de envío de datos a terceros.

Quedo a la espera de tu validación para proceder a generar los scripts de migración de base de datos y el código base del endpoint \`/api/assistant\` con la orquestación de herramientas.

