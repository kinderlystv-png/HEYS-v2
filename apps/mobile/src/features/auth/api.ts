import { apiClient } from '../../services/api-client';

export type LoginRequest = { 
  email: string; 
  password: string;
};

export type LoginResponse = { 
  token: string;
};

export async function login(req: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', req); // Замени /auth/login на реальный эндпоинт
}
