import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any) {
    const roleName = currentUser.role?.name;

    const includeOptions = {
      manager: { select: { id: true, name: true, email: true } },
      teamLead: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    };

    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') {
      return this.prisma.team.findMany({
        include: includeOptions,
        orderBy: { name: 'asc' },
      });
    }

    if (roleName === 'MANAGER') {
      return this.prisma.team.findMany({
        where: { managerId: currentUser.id },
        include: includeOptions,
        orderBy: { name: 'asc' },
      });
    }

    if (roleName === 'TEAM_LEAD') {
      return this.prisma.team.findMany({
        where: { teamLeadId: currentUser.id },
        include: includeOptions,
        orderBy: { name: 'asc' },
      });
    }

    if (roleName === 'TEAM_MEMBER') {
      return this.prisma.team.findMany({
        where: {
          members: {
            some: { userId: currentUser.id },
          },
        },
        include: includeOptions,
        orderBy: { name: 'asc' },
      });
    }

    return [];
  }

  async findOne(id: string, currentUser: any) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        teamLead: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Team with ID "${id}" not found`);
    }

    const roleName = currentUser.role?.name;
    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') {
      return team;
    }

    if (roleName === 'MANAGER') {
      if (team.managerId !== currentUser.id) {
        throw new ForbiddenException('You do not have permission to access this team');
      }
      return team;
    }

    if (roleName === 'TEAM_LEAD') {
      if (team.teamLeadId !== currentUser.id) {
        throw new ForbiddenException('You do not have permission to access this team');
      }
      return team;
    }

    if (roleName === 'TEAM_MEMBER') {
      const isMember = team.members.some((m) => m.userId === currentUser.id);
      if (!isMember) {
        throw new ForbiddenException('You do not have permission to access this team');
      }
      return team;
    }

    throw new ForbiddenException('Role not authorized to access teams');
  }

  async create(createTeamDto: CreateTeamDto, currentUser: any) {
    const roleName = currentUser.role?.name;
    let managerId = createTeamDto.managerId;

    if (roleName === 'MANAGER') {
      managerId = currentUser.id;
    } else if (roleName === 'SUPER_ADMIN') {
      if (!managerId) {
        throw new BadRequestException('managerId is required for Super Admin to create a team');
      }
      const mgr = await this.prisma.user.findUnique({
        where: { id: managerId },
        include: { role: true },
      });
      if (!mgr || mgr.role?.name !== 'MANAGER') {
        throw new BadRequestException('The specified managerId must correspond to a user with the MANAGER role');
      }
    } else {
      throw new ForbiddenException('Only MANAGERS and SUPER_ADMINS can create teams');
    }

    const lead = await this.prisma.user.findUnique({
      where: { id: createTeamDto.teamLeadId },
      include: { role: true },
    });
    if (!lead || lead.role?.name !== 'TEAM_LEAD') {
      throw new BadRequestException('The specified teamLeadId must correspond to a user with the TEAM_LEAD role');
    }

    if (lead.managerId !== managerId) {
      throw new BadRequestException('The selected Team Lead must be subordinate to the team\'s Manager');
    }

    const { name, teamLeadId, memberUserIds } = createTeamDto;

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name,
          managerId,
          teamLeadId,
        },
      });

      if (memberUserIds && memberUserIds.length > 0) {
        const membersList = await tx.user.findMany({
          where: { id: { in: memberUserIds } },
          include: { role: true },
        });

        if (membersList.length !== memberUserIds.length) {
          throw new BadRequestException('One or more member user IDs do not exist');
        }

        const nonMembers = membersList.filter(m => m.role?.name !== 'TEAM_MEMBER');
        if (nonMembers.length > 0) {
          throw new BadRequestException(`Users ${nonMembers.map(u => u.name).join(', ')} do not have the TEAM_MEMBER role`);
        }

        for (const member of membersList) {
          if (member.managerId !== managerId && member.managerId !== teamLeadId) {
            throw new BadRequestException(`Member ${member.name} is not managed by this Manager or Team Lead`);
          }
        }

        await tx.teamMember.createMany({
          data: memberUserIds.map((userId) => ({
            teamId: team.id,
            userId,
          })),
        });
      }

      return tx.team.findUnique({
        where: { id: team.id },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          teamLead: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });
  }

  async update(id: string, updateTeamDto: UpdateTeamDto, currentUser: any) {
    const team = await this.findOne(id, currentUser);

    const roleName = currentUser.role?.name;
    if (roleName !== 'SUPER_ADMIN' && roleName !== 'MANAGER') {
      throw new ForbiddenException('Only Managers and Super Admins can update teams');
    }

    if (roleName === 'MANAGER' && team.managerId !== currentUser.id) {
      throw new ForbiddenException('You can only update your own teams');
    }

    const { name, managerId, teamLeadId, memberUserIds } = updateTeamDto;

    let finalManagerId = team.managerId;
    if (managerId && managerId !== team.managerId) {
      if (roleName !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Only Super Admin can reassign a team to another Manager');
      }
      const mgr = await this.prisma.user.findUnique({
        where: { id: managerId },
        include: { role: true },
      });
      if (!mgr || mgr.role?.name !== 'MANAGER') {
        throw new BadRequestException('The specified managerId must correspond to a user with the MANAGER role');
      }
      finalManagerId = managerId;
    }

    let finalLeadId = team.teamLeadId;
    if (teamLeadId && teamLeadId !== team.teamLeadId) {
      const lead = await this.prisma.user.findUnique({
        where: { id: teamLeadId },
        include: { role: true },
      });
      if (!lead || lead.role?.name !== 'TEAM_LEAD') {
        throw new BadRequestException('The specified teamLeadId must correspond to a user with the TEAM_LEAD role');
      }
      if (lead.managerId !== finalManagerId) {
        throw new BadRequestException('The selected Team Lead must be subordinate to the team\'s Manager');
      }
      finalLeadId = teamLeadId;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: {
          name: name || undefined,
          managerId: finalManagerId,
          teamLeadId: finalLeadId,
        },
      });

      if (memberUserIds !== undefined) {
        await tx.teamMember.deleteMany({
          where: { teamId: id },
        });

        if (memberUserIds.length > 0) {
          const membersList = await tx.user.findMany({
            where: { id: { in: memberUserIds } },
            include: { role: true },
          });

          if (membersList.length !== memberUserIds.length) {
            throw new BadRequestException('One or more member user IDs do not exist');
          }

          const nonMembers = membersList.filter(m => m.role?.name !== 'TEAM_MEMBER');
          if (nonMembers.length > 0) {
            throw new BadRequestException(`Users ${nonMembers.map(u => u.name).join(', ')} do not have the TEAM_MEMBER role`);
          }

          for (const member of membersList) {
            if (member.managerId !== finalManagerId && member.managerId !== finalLeadId) {
              throw new BadRequestException(`Member ${member.name} is not managed by this Manager or Team Lead`);
            }
          }

          await tx.teamMember.createMany({
            data: memberUserIds.map((userId) => ({
              teamId: id,
              userId,
            })),
          });
        }
      }

      return tx.team.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          teamLead: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });
  }

  async remove(id: string, currentUser: any) {
    const team = await this.findOne(id, currentUser);

    const roleName = currentUser.role?.name;
    if (roleName !== 'SUPER_ADMIN' && roleName !== 'MANAGER') {
      throw new ForbiddenException('Only Managers and Super Admins can delete teams');
    }

    if (roleName === 'MANAGER' && team.managerId !== currentUser.id) {
      throw new ForbiddenException('You can only delete your own teams');
    }

    await this.prisma.team.delete({
      where: { id },
    });

    return { message: `Team "${team.name}" deleted successfully` };
  }
}
