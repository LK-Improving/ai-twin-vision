import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Swagger 分页响应装饰器。
 * 生成 { code, message, data: { total, page, limit, dataList: T[] }, timestamp } 的文档结构，
 * 保证 OpenAPI 契约与实际响应一致（详细设计 3.2 接口契约管理）。
 */
export const ApiPageResponse = <TModel extends Type<unknown>>(model: TModel) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              code: { type: 'number', example: 200 },
              message: { type: 'string', example: 'success' },
              timestamp: { type: 'string', example: new Date().toISOString() },
              data: {
                type: 'object',
                properties: {
                  total: { type: 'number', example: 50 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 20 },
                  dataList: { type: 'array', items: { $ref: getSchemaPath(model) } },
                },
              },
            },
          },
        ],
      },
    }),
  );

/** Swagger 单对象响应装饰器 */
export const ApiDataResponse = <TModel extends Type<unknown>>(model: TModel, message = 'success') =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              code: { type: 'number', example: 200 },
              message: { type: 'string', example: message },
              timestamp: { type: 'string', example: new Date().toISOString() },
              data: { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );
