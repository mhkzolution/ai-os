import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = String(req.headers['x-request-id'] ?? '');

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message;
      const error =
        typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : exception.name;
      res
        .status(status)
        .json({ statusCode: status, error, message, requestId });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL',
      message: 'Internal server error',
      requestId,
    });
  }
}
