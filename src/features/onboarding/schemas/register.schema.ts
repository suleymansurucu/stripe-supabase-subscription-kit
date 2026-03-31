import { z } from 'zod'

export const pocRegisterSchema = z
  .object({
    fullName: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email required'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type PocRegisterFormValues = z.infer<typeof pocRegisterSchema>

export const pocLoginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
})

export type PocLoginFormValues = z.infer<typeof pocLoginSchema>
