import Link from 'next/link'
import ProductForm from '@/components/ProductForm'

export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">← חזרה</Link>
          <h1 className="text-2xl font-bold text-white">מוצר חדש</h1>
        </div>
        <ProductForm />
      </div>
    </div>
  )
}
