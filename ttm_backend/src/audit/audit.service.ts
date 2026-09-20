import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an immutable audit record for any sensitive mutation.
   * @param actorId    - The user ID performing the action
   * @param actorEmail - The actor's email (denormalised for readability if user is later deleted)
   * @param action     - Machine-readable action name (e.g. USER_DEACTIVATED)
   * @param targetId   - The ID of the resource being acted on (optional)
   * @param targetType - The type of the resource (e.g. "USER", "ROLE")
   * @param detail     - Human-readable or JSON detail string
   */
  async log(
    actorId: string,
    actorEmail: string,
    action: string,
    targetId?: string,
    targetType?: string,
    detail?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId, actorEmail, action, targetId, targetType, detail },
    });
  }

  async findAll(): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
