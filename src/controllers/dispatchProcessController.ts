import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';

export const createDispatchProcess = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Validate workflow - DispatchProcess requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'DispatchProcess');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const dispatchProcess = await prisma.dispatchProcess.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { dispatchProcess: { connect: { id: dispatchProcess.id } } } });

  // Log DispatchProcess step creation
  if (req.user?.userId) {
    // Get the nrcJobNo from the jobStep
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: jobStepId },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true
          }
        }
      }
    });

    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created DispatchProcess step for jobStepId: ${jobStepId}`,
      'DispatchProcess',
      dispatchProcess.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: dispatchProcess, message: 'DispatchProcess step created' });
};

export const getDispatchProcessById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dispatchProcess = await prisma.dispatchProcess.findUnique({ where: { id: Number(id) } });
  if (!dispatchProcess) throw new AppError('DispatchProcess not found', 404);
  res.status(200).json({ success: true, data: dispatchProcess });
};

export const getAllDispatchProcesses = async (_req: Request, res: Response) => {
  const dispatchProcesses = await prisma.dispatchProcess.findMany();
  res.status(200).json({ success: true, count: dispatchProcesses.length, data: dispatchProcesses });
};

export const getDispatchProcessByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const dispatchProcesses = await prisma.dispatchProcess.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: dispatchProcesses });
};


export const updateDispatchProcess = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Step 1: Find the DispatchProcess record by jobNrcJobNo
    const existingDispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // Step 2: Update using its unique id
    const dispatchProcess = await prisma.dispatchProcess.update({
      where: { id: existingDispatchProcess.id },
      data: req.body,
    });

    // Step 3: Log update
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated DispatchProcess step with jobNrcJobNo: ${nrcJobNo}`,
        'DispatchProcess',
        nrcJobNo
      );
    }

    // Step 4: Respond
    res.status(200).json({
      success: true,
      data: dispatchProcess,
      message: 'DispatchProcess updated',
    });

  } catch (error: unknown) {
    console.error('Update DispatchProcess error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteDispatchProcess = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.dispatchProcess.delete({ where: { id: Number(id) } });

  // Log DispatchProcess step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted DispatchProcess step with id: ${id}`,
      'DispatchProcess',
      id
    );
  }
  res.status(200).json({ success: true, message: 'DispatchProcess deleted' });
}; 