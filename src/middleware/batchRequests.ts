import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

interface BatchRequest {
  method: string;
  path: string;
  body?: any;
  query?: any;
  params?: any;
}

interface BatchResponse {
  method: string;
  path: string;
  status: number;
  data?: any;
  error?: string;
}

export const batchRequestsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Only handle POST requests to /api/batch
  if (req.method !== 'POST' || req.path !== '/api/batch') {
    return next();
  }

  try {
    const { requests }: { requests: BatchRequest[] } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Requests array is required and must not be empty'
      });
    }

    if (requests.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 20 requests allowed per batch'
      });
    }

    const responses: BatchResponse[] = [];

    // Process requests in parallel for better performance
    const batchPromises = requests.map(async (batchReq) => {
      try {
        const response = await processBatchRequest(batchReq);
        return response;
      } catch (error) {
        return {
          method: batchReq.method,
          path: batchReq.path,
          status: 500,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const batchResponses = await Promise.all(batchPromises);
    responses.push(...batchResponses);

    res.json({
      success: true,
      responses
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Batch processing failed'
    });
  }
};

async function processBatchRequest(batchReq: BatchRequest): Promise<BatchResponse> {
  const { method, path, body, query, params } = batchReq;

  // Map common endpoints to their handlers
  const endpointHandlers: { [key: string]: Function } = {
    'GET:/api/jobs': () => prisma.job.findMany({ orderBy: { createdAt: 'desc' } }),
    'GET:/api/machines': () => prisma.machine.findMany(),
    'GET:/api/job-planning': () => prisma.jobPlanning.findMany({
      include: { steps: true },
      orderBy: { jobPlanId: 'desc' }
    }),
    'GET:/api/activity-logs': () => prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    'GET:/api/completed-jobs': () => prisma.completedJob.findMany({
      orderBy: { completedAt: 'desc' }
    }),
    'GET:/api/purchase-orders': () => prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' }
    })
  };

  const handlerKey = `${method}:${path}`;
  const handler = endpointHandlers[handlerKey];

  if (handler) {
    try {
      const data = await handler();
      return {
        method,
        path,
        status: 200,
        data
      };
    } catch (error) {
      return {
        method,
        path,
        status: 500,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  // Handle job-specific endpoints
  if (path.startsWith('/api/jobs/') && method === 'GET') {
    const nrcJobNo = path.split('/').pop();
    if (nrcJobNo) {
      try {
        const job = await prisma.job.findUnique({
          where: { nrcJobNo }
        });
        return {
          method,
          path,
          status: job ? 200 : 404,
          data: job,
          error: job ? undefined : 'Job not found'
        };
      } catch (error) {
        return {
          method,
          path,
          status: 500,
          error: error instanceof Error ? error.message : 'Database error'
        };
      }
    }
  }

  return {
    method,
    path,
    status: 404,
    error: 'Endpoint not supported in batch mode'
  };
} 