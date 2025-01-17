import { Checker, CourseTask } from '@entities/courseTask';
import { User } from '@entities/user';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository, FindOptionsWhere } from 'typeorm';
import * as dayjs from 'dayjs';

export enum Status {
  Started = 'started',
  InProgress = 'inprogress',
  Finished = 'finished',
}

@Injectable()
export class CourseTasksService {
  constructor(
    @InjectRepository(CourseTask)
    readonly courseTaskRepository: Repository<CourseTask>,
  ) {}

  public getAll(courseId: number, status?: 'started' | 'inprogress' | 'finished') {
    return this.courseTaskRepository
      .createQueryBuilder('courseTask')
      .innerJoinAndSelect('courseTask.task', 'task')
      .where({ courseId, disabled: false, ...this.getFindConditionForStatus(status) })
      .orderBy('courseTask.studentEndDate', 'ASC')
      .addOrderBy('task.name', 'ASC')
      .getMany();
  }

  public getById(courseTaskId: number) {
    return this.courseTaskRepository.findOneOrFail({
      where: { id: courseTaskId },
      relations: ['task'],
    });
  }

  public getByOwner(username: string) {
    return this.courseTaskRepository
      .createQueryBuilder('t')
      .leftJoin(User, 'u', 'u.id = t.taskOwnerId')
      .where(`t.checker = :checker`, { checker: Checker.TaskOwner })
      .andWhere('u.githubId = :username', { username })
      .getMany();
  }

  private getFindConditionForStatus(status?: 'started' | 'inprogress' | 'finished'): FindOptionsWhere<CourseTask> {
    const now = new Date().toISOString();
    let where: FindOptionsWhere<CourseTask> = {};

    switch (status) {
      case 'started':
        where = { ...where, studentStartDate: LessThanOrEqual(now) };
        break;
      case 'inprogress':
        where = { ...where, studentStartDate: LessThanOrEqual(now), studentEndDate: MoreThan(now) };
        break;
      case 'finished':
        where = { ...where, studentEndDate: LessThan(now) };
        break;
    }
    return where;
  }

  public getUpdatedTasks(courseId: number, lastHours: number) {
    const date = dayjs().subtract(lastHours, 'hours');

    return this.courseTaskRepository.find({
      where: { courseId, updatedDate: MoreThanOrEqual(date.toISOString()) },
      relations: ['task'],
    });
  }

  public getTasksPendingDeadline(
    courseId: number,
    { deadlineWithinHours = 24 }: { deadlineWithinHours?: number } = {},
  ) {
    const now = dayjs().toISOString();
    const endDate = dayjs().add(deadlineWithinHours, 'hours').toISOString();

    const where: FindOptionsWhere<CourseTask> = {
      courseId,
      disabled: false,
      studentStartDate: LessThanOrEqual(now),
      studentEndDate: Between(now, endDate),
    };

    return this.courseTaskRepository.find({
      where,
      relations: ['task', 'taskSolutions'],
      order: {
        studentEndDate: 'ASC',
      },
    });
  }

  public createCourseTask(courseEvent: Partial<CourseTask>) {
    return this.courseTaskRepository.insert(courseEvent);
  }

  public updateCourseTask(id: number, courseEvent: Partial<CourseTask>) {
    return this.courseTaskRepository.update(id, courseEvent);
  }

  public disable(id: number) {
    return this.courseTaskRepository.update(id, {
      id, // required to get right update in subscription
      disabled: true,
    });
  }
}
