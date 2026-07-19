/**
 * 서버 검증 실패를 HTTP 상태로 매핑하기 위한 표준 에러.
 * 서비스 계층에서 throw → route handler가 status로 변환.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "권한이 없습니다", code = "FORBIDDEN") {
    super(403, message, code);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "요청이 올바르지 않습니다", code = "VALIDATION") {
    super(422, message, code);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "찾을 수 없습니다", code = "NOT_FOUND") {
    super(404, message, code);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "이미 존재합니다", code = "CONFLICT") {
    super(409, message, code);
    this.name = "ConflictError";
  }
}
