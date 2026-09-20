import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskPriority, TaskStatus } from '@prisma/client';

const TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────

  async create(createTaskDto: CreateTaskDto, currentUser: any) {
    const roleName: string = currentUser.role?.name;

    // Validate team membership constraints when teamId is provided
    if (createTaskDto.teamId) {
      await this.assertTeamAccess(createTaskDto.teamId, currentUser, roleName);
    }

    // Validate assignee constraints
    if (createTaskDto.assigneeId) {
      await this.assertAssigneeAccess(
        createTaskDto.assigneeId,
        createTaskDto.teamId,
        currentUser,
        roleName,
      );
    }

    return this.prisma.task.create({
      data: {
        title: createTaskDto.title,
        description: createTaskDto.description ?? null,
        priority: createTaskDto.priority ?? TaskPriority.MEDIUM,
        status: createTaskDto.status ?? TaskStatus.TODO,
        dueDate: createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : null,
        createdById: currentUser.id,
        assignedToId: createTaskDto.assigneeId ?? null,
        teamId: createTaskDto.teamId ?? null,
      },
      include: TASK_INCLUDE,
    });
  }

  // ─── READ ALL (role-scoped) ────────────────────────────────────────────────

  async findAll(currentUser: any, filters?: { status?: TaskStatus; teamId?: string }) {
    const roleName: string = currentUser.role?.name;
    const statusFilter = filters?.status ? { status: filters.status } : {};

    // SUPER_ADMIN / ADMIN — see everything
    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') {
      return this.prisma.task.findMany({
        where: {
          ...statusFilter,
          ...(filters?.teamId && { teamId: filters.teamId }),
        },
        include: TASK_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }

    // MANAGER — see tasks belonging to their teams
    if (roleName === 'MANAGER') {
      const myTeams = await this.prisma.team.findMany({
        where: { managerId: currentUser.id },
        select: { id: true },
      });
      const teamIds = myTeams.map((t) => t.id);
      return this.prisma.task.findMany({
        where: {
          ...statusFilter,
          OR: [
            { teamId: { in: teamIds } },
            { createdById: currentUser.id },
          ],
          ...(filters?.teamId && { teamId: filters.teamId }),
        },
        include: TASK_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }

    // TEAM_LEAD — tasks in their teams
    if (roleName === 'TEAM_LEAD') {
      const myTeams = await this.prisma.team.findMany({
        where: { teamLeadId: currentUser.id },
        select: { id: true },
      });
      const teamIds = myTeams.map((t) => t.id);
      return this.prisma.task.findMany({
        where: {
          ...statusFilter,
          OR: [
            { teamId: { in: teamIds } },
            { assignedToId: currentUser.id },
          ],
          ...(filters?.teamId && { teamId: filters.teamId }),
        },
        include: TASK_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }

    // TEAM_MEMBER — only their own assigned tasks
    return this.prisma.task.findMany({
      where: {
        ...statusFilter,
        assignedToId: currentUser.id,
        ...(filters?.teamId && { teamId: filters.teamId }),
      },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── READ ONE ─────────────────────────────────────────────────────────────

  async findOne(id: string, currentUser: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });

    if (!task) throw new NotFoundException(`Task with ID "${id}" not found`);

    await this.assertReadAccess(task, currentUser);
    return task;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  async update(id: string, updateTaskDto: UpdateTaskDto, currentUser: any) {
    const task = await this.findOne(id, currentUser); // also checks read access
    const roleName: string = currentUser.role?.name;

    // Only SUPER_ADMIN, ADMIN, MANAGER, TEAM_LEAD, or the assigned person can update
    const isAssigned = task.assignedToId === currentUser.id;
    const canManage =
      roleName === 'SUPER_ADMIN' ||
      roleName === 'ADMIN' ||
      roleName === 'MANAGER' ||
      roleName === 'TEAM_LEAD';

    if (!canManage && !isAssigned) {
      throw new ForbiddenException('You are not allowed to update this task');
    }

    // TEAM_MEMBER can only change status (not reassign or change team)
    if (roleName === 'TEAM_MEMBER') {
      const allowedKeys = ['status'];
      const extraKeys = Object.keys(updateTaskDto).filter(
        (k) => !allowedKeys.includes(k),
      );
      if (extraKeys.length > 0) {
        throw new ForbiddenException('Team members can only update task status');
      }
    }

    // Validate new teamId / assigneeId if being changed
    const teamId = updateTaskDto.teamId !== undefined ? updateTaskDto.teamId : task.teamId;
    if (updateTaskDto.teamId !== undefined && updateTaskDto.teamId) {
      await this.assertTeamAccess(updateTaskDto.teamId, currentUser, roleName);
    }
    if (updateTaskDto.assigneeId !== undefined && updateTaskDto.assigneeId) {
      await this.assertAssigneeAccess(
        updateTaskDto.assigneeId,
        teamId ?? undefined,
        currentUser,
        roleName,
      );
    }

    // Auto-set completedAt when status transitions to DONE
    const completedAt =
      updateTaskDto.status === TaskStatus.DONE && task.status !== TaskStatus.DONE
        ? new Date()
        : updateTaskDto.status && updateTaskDto.status !== TaskStatus.DONE && task.completedAt
        ? null
        : undefined;

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(updateTaskDto.title && { title: updateTaskDto.title }),
        ...(updateTaskDto.description !== undefined && { description: updateTaskDto.description }),
        ...(updateTaskDto.status && { status: updateTaskDto.status }),
        ...(updateTaskDto.priority && { priority: updateTaskDto.priority }),
        ...(updateTaskDto.dueDate !== undefined && {
          dueDate: updateTaskDto.dueDate ? new Date(updateTaskDto.dueDate) : null,
        }),
        ...(updateTaskDto.assigneeId !== undefined && { assignedToId: updateTaskDto.assigneeId }),
        ...(updateTaskDto.teamId !== undefined && { teamId: updateTaskDto.teamId }),
        ...(completedAt !== undefined && { completedAt }),
      },
      include: TASK_INCLUDE,
    });
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  async remove(id: string, currentUser: any) {
    const task = await this.findOne(id, currentUser);
    const roleName: string = currentUser.role?.name;

    if (
      roleName !== 'SUPER_ADMIN' &&
      roleName !== 'ADMIN' &&
      roleName !== 'MANAGER' &&
      task.createdById !== currentUser.id
    ) {
      throw new ForbiddenException('You are not allowed to delete this task');
    }

    await this.prisma.task.delete({ where: { id } });
    return { message: `Task "${task.title}" deleted successfully` };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private async assertReadAccess(task: any, currentUser: any) {
    const roleName: string = currentUser.role?.name;
    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') return;

    if (roleName === 'MANAGER') {
      if (!task.teamId) {
        if (task.createdById !== currentUser.id) {
          throw new ForbiddenException('You do not have access to this task');
        }
        return;
      }
      const team = await this.prisma.team.findUnique({ where: { id: task.teamId } });
      if (team?.managerId !== currentUser.id) {
        throw new ForbiddenException('This task does not belong to your team');
      }
      return;
    }

    if (roleName === 'TEAM_LEAD') {
      if (!task.teamId) {
        if (task.assignedToId !== currentUser.id) {
          throw new ForbiddenException('You do not have access to this task');
        }
        return;
      }
      const team = await this.prisma.team.findUnique({ where: { id: task.teamId } });
      if (team?.teamLeadId !== currentUser.id) {
        throw new ForbiddenException('This task does not belong to your team');
      }
      return;
    }

    // TEAM_MEMBER
    if (task.assignedToId !== currentUser.id) {
      throw new ForbiddenException('You can only view tasks assigned to you');
    }
  }

  private async assertTeamAccess(teamId: string, currentUser: any, roleName: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new BadRequestException(`Team with ID "${teamId}" not found`);

    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') return;

    if (roleName === 'MANAGER' && team.managerId !== currentUser.id) {
      throw new ForbiddenException('You can only create tasks in your own teams');
    }
    if (roleName === 'TEAM_LEAD' && team.teamLeadId !== currentUser.id) {
      throw new ForbiddenException('You can only create tasks in teams you lead');
    }
    if (roleName === 'TEAM_MEMBER') {
      const membership = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: currentUser.id } },
      });
      if (!membership) {
        throw new ForbiddenException('You can only create tasks in teams you belong to');
      }
    }
  }

  private async assertAssigneeAccess(
    assigneeId: string,
    teamId: string | undefined,
    currentUser: any,
    roleName: string,
  ) {
    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      include: { role: true },
    });
    if (!assignee) throw new BadRequestException(`Assignee with ID "${assigneeId}" not found`);

    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') return;

    // If team is specified, assignee must be a member of that team
    if (teamId) {
      const membership = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: assigneeId } },
      });
      if (!membership) {
        throw new BadRequestException('Assignee is not a member of the specified team');
      }
    }
  }
}