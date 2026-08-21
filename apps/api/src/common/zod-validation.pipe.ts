import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against a zod schema (CLAUDE.md: all DTOs are zod-validated).
 *
 * Failure messages name the field and say what is wrong, in the interface's
 * voice — never "An error occurred".
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      message: 'That request could not be read.',
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        problem: issue.message,
      })),
    });
  }
}
