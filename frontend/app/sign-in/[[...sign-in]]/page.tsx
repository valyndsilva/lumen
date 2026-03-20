import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-bg-surface border border-border-subtle shadow-2xl shadow-black/20',
          },
        }}
      />
    </div>
  )
}
