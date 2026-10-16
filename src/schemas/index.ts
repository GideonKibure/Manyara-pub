import { z } from 'zod'

const money = (label: string) =>
  z
    .number({ invalid_type_error: `Enter ${label}` })
    .int(`${label} must be a whole number`)
    .nonnegative(`${label} cannot be negative`)
    .max(100_000_000, `${label} is too large`)

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Enter your password'),
})

export const forgotSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
})

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

export const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirm the new password'),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(80),
  phone: z.string().trim().max(30),
})

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Enter the current password'),
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirm the new password'),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a product name').max(80),
    categoryId: z.string().min(1, 'Choose a category'),
    sku: z.string().trim().max(40).optional().or(z.literal('')),
    imageUrl: z
      .string()
      .trim()
      .max(400_000)
      .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value) || value.startsWith('data:image/'), 'Choose a product photo')
      .optional()
      .or(z.literal('')),
    stockUnitId: z.string().min(1, 'Choose the stock unit'),
    receiveUnitId: z.string().min(1, 'Choose the receiving unit'),
    conversionFactor: z
      .number({ invalid_type_error: 'Enter how many stock units are in one received unit' })
      .int('Conversion must be a whole number')
      .positive('Conversion must be at least 1')
      .max(10_000),
    costPrice: money('the cost price'),
    sellingPrice: money('the selling price'),
    sizeMode: z.enum(['one', 'many']),
    sizes: z.array(
      z.object({
        name: z.enum(['small', 'medium', 'big']),
        cost: money('the cost price'),
        price: money('the selling price'),
        cupPrice: money('the cup price').nullable(),
        halfPrice: money('the half price').nullable(),
      }),
    ),
    cupPrice: money('the cup price').nullable(),
    halfPrice: money('the half price').nullable(),
    minStock: z
      .number({ invalid_type_error: 'Enter the minimum stock' })
      .int('Minimum stock must be a whole number')
      .nonnegative('Minimum stock cannot be negative')
      .max(1_000_000),
    isActive: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.stockUnitId === value.receiveUnitId && value.conversionFactor !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conversionFactor'],
        message: 'Use a conversion of 1 when stock is received in the same unit',
      })
    }
    if (value.sizeMode === 'many' && value.sizes.length < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sizes'], message: 'Choose at least one size' })
    }
    if (value.sizeMode === 'one' && value.sizes.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sizes'], message: 'A single-size product does not use the size list' })
    }
  })

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name').max(60),
  description: z.string().trim().max(160),
  isActive: z.boolean(),
})

export const employeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the employee name').max(80),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, or hyphens'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  password: passwordSchema,
  canSubmitActivities: z.boolean(),
  canViewStock: z.boolean(),
})

export const settingsSchema = z.object({
  businessName: z.string().trim().min(2, 'Enter the business name').max(80),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  currencySymbol: z.string().trim().min(1, 'Enter a currency symbol').max(8),
  lowStockAlerts: z.boolean(),
  allowRemainingCount: z.boolean(),
})

export const unitSchema = z.object({
  name: z.string().trim().min(2, 'Enter a unit name').max(30),
  abbreviation: z.string().trim().min(1, 'Enter an abbreviation').max(8),
})

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter the supplier name').max(80),
  phone: z.string().trim().max(30),
})

export const activityTypeSchema = z.object({
  pricingMode: z.enum(['per_game', 'per_session', 'per_play', 'flat']),
  unitPrice: money('the price'),
  unitLabel: z.string().trim().min(2, 'Enter the unit label').max(30),
  isActive: z.boolean(),
})

export const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Enter a reason with at least 3 characters').max(300),
})

export type LoginValues = z.infer<typeof loginSchema>
export type ProductValues = z.infer<typeof productSchema>
export type CategoryValues = z.infer<typeof categorySchema>
export type EmployeeValues = z.infer<typeof employeeSchema>
export type SettingsValues = z.infer<typeof settingsSchema>
