import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { platformApi } from '../../api';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [message, setMessage] = useState('Connecting your account...');
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Get stored platform from localStorage
      const storedPlatform = localStorage.getItem('oauth_platform');
      const storedState = localStorage.getItem('oauth_state');
      
      if (storedPlatform) {
        setPlatform(storedPlatform);
      }

      // Handle OAuth error from provider
      if (error) {
        setStatus('error');
        setMessage(errorDescription || `Authorization failed: ${error}`);
        localStorage.removeItem('oauth_platform');
        localStorage.removeItem('oauth_state');
        return;
      }

      // Validate required params
      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code or state parameter');
        return;
      }

      // Validate state matches (CSRF protection)
      if (state !== storedState) {
        setStatus('error');
        setMessage('Invalid state parameter - possible CSRF attack');
        localStorage.removeItem('oauth_platform');
        localStorage.removeItem('oauth_state');
        return;
      }

      try {
        setMessage(`Exchanging authorization code for ${storedPlatform || 'platform'}...`);
        
        // Exchange code for tokens via backend
        const { data } = await platformApi.handleOAuthCallback({
          code,
          state
        });

        // Clean up localStorage
        localStorage.removeItem('oauth_platform');
        localStorage.removeItem('oauth_state');

        setStatus('success');
        setMessage(`${data.platform || storedPlatform || 'Platform'} connected successfully!`);
        toast.success(`${data.platform || storedPlatform} connected!`);

        // Redirect to platforms page after short delay
        setTimeout(() => {
          navigate('/admin/platforms');
        }, 2000);

      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Failed to complete authorization');
        localStorage.removeItem('oauth_platform');
        localStorage.removeItem('oauth_state');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === 'processing' && (
            <>
              <Loader2 size={48} className="animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-semibold" style={{ fontFamily: 'Manrope' }}>
                Connecting {platform || 'Platform'}
              </h2>
              <p className="text-muted-foreground text-sm">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} className="text-emerald-500 mx-auto" />
              <h2 className="text-xl font-semibold text-emerald-600" style={{ fontFamily: 'Manrope' }}>
                Connection Successful!
              </h2>
              <p className="text-muted-foreground text-sm">{message}</p>
              <p className="text-xs text-muted-foreground">Redirecting to platforms page...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={48} className="text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold text-red-600" style={{ fontFamily: 'Manrope' }}>
                Connection Failed
              </h2>
              <p className="text-muted-foreground text-sm">{message}</p>
              <Button 
                onClick={() => navigate('/admin/platforms')}
                className="mt-4"
                data-testid="back-to-platforms-btn"
              >
                Back to Platforms
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
