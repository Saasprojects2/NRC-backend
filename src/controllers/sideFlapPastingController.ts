import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';

export const createSideFlapPasting = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Validate workflow - SideFlapPasting requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'SideFlapPasting');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const sideFlapPasting = await prisma.sideFlapPasting.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { sideFlapPasting: { connect: { id: sideFlapPasting.id } } } });

  // Log SideFlapPasting step creation
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
      `Created SideFlapPasting step for jobStepId: ${jobStepId}`,
      'SideFlapPasting',
      sideFlapPasting.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: sideFlapPasting, message: 'SideFlapPasting step created' });
};

export const getSideFlapPastingById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sideFlapPasting = await prisma.sideFlapPasting.findUnique({ where: { id: Number(id) } });
  if (!sideFlapPasting) throw new AppError('SideFlapPasting not found', 404);
  res.status(200).json({ success: true, data: sideFlapPasting });
};

export const getAllSideFlapPastings = async (_req: Request, res: Response) => {
  const sideFlapPastings = await prisma.sideFlapPasting.findMany();
  res.status(200).json({ success: true, count: sideFlapPastings.length, data: sideFlapPastings });
};

export const getSideFlapPastingByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const sideFlaps = await prisma.sideFlapPasting.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: sideFlaps });
};



export const updateSideFlapPasting = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Step 1: Find the existing SideFlapPasting record
    const existingSideFlap = await prisma.sideFlapPasting.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingSideFlap) {
      throw new AppError('SideFlapPasting record not found', 404);
    }

    // Step 2: Update using its unique `id`
    const sideFlapPasting = await prisma.sideFlapPasting.update({
      where: { id: existingSideFlap.id },
      data: req.body,
    });

    // Step 3: Optional logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated SideFlapPasting step with jobNrcJobNo: ${nrcJobNo}`,
        'SideFlapPasting',
        nrcJobNo
      );
    }

    // Step 4: Respond with updated data
    res.status(200).json({
      success: true,
      data: sideFlapPasting,
      message: 'SideFlapPasting updated',
    });

  } catch (error: unknown) {
    console.error('Update SideFlapPasting error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteSideFlapPasting = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.sideFlapPasting.delete({ where: { id: Number(id) } });

  // Log SideFlapPasting step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted SideFlapPasting step with id: ${id}`,
      'SideFlapPasting',
      id
    );
  }
  res.status(200).json({ success: true, message: 'SideFlapPasting deleted' });
}; 