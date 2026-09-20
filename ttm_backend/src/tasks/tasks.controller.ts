import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { TaskStatus } from '@prisma/client';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RequirePermission('TASKS', 'CREATE')
  create(@Body() createTaskDto: CreateTaskDto, @Req() req: any) {
    return this.tasksService.create(createTaskDto, req.user);
  }

  @Get()
  @RequirePermission('TASKS', 'READ')
  findAll(
    @Req() req: any,
    @Query('status') status?: TaskStatus,
    @Query('teamId') teamId?: string,
  ) {
    return this.tasksService.findAll(req.user, { status, teamId });
  }

  @Get(':id')
  @RequirePermission('TASKS', 'READ')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermission('TASKS', 'UPDATE')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Req() req: any) {
    return this.tasksService.update(id, updateTaskDto, req.user);
  }

  @Delete(':id')
  @RequirePermission('TASKS', 'DELETE')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.remove(id, req.user);
  }
}