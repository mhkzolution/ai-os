import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('AI OS')
    .setDescription('AI OS API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'apiKey')
    .build();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildOpenApiConfig());
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function compactOpenApiAuth(document: OpenAPIObject) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!item) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      paths[path] ??= {};
      paths[path][method] = {
        tags: operation.tags ?? [],
        security: operation.security ?? [],
      };
    }
  }
  return {
    securitySchemes: document.components?.securitySchemes ?? {},
    paths,
  };
}
