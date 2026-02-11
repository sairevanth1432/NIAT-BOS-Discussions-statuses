import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { MockSheetService } from "@/lib/mock-sheets";
import { useToast } from "@/hooks/use-toast";
import heroBg from "@/assets/hero-bg.png";

const formSchema = z.object({
  sheetId: z.string().min(5, "Sheet ID is too short to be valid"),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sheetId: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const isValid = await MockSheetService.validateSheetId(values.sheetId);
      
      if (isValid) {
        toast({
          title: "Connection Successful",
          description: "Syncing data from Google Sheet...",
        });
        // Store ID in local storage for "persistence" in this session
        localStorage.setItem("connectedSheetId", values.sheetId);
        
        setTimeout(() => {
          setLocation("/dashboard");
        }, 1000);
      } else {
        form.setError("sheetId", { 
          type: "manual", 
          message: "Could not access this Sheet ID. Check permissions." 
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to connect to Google Sheets API.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Hero Section */}
      <div className="relative w-full md:w-1/2 lg:w-2/3 bg-slate-900 overflow-hidden flex flex-col justify-center items-center text-white p-12">
        <div 
          className="absolute inset-0 z-0 opacity-40 mix-blend-overlay" 
          style={{ 
            backgroundImage: `url(${heroBg})`, 
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }} 
        />
        <div className="relative z-10 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Live Data Sync v2.0
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Turn your <span className="text-blue-400">Spreadsheets</span> into <span className="text-emerald-400">Insights</span>.
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Connect your Google Sheets instantly. Generate professional dashboards, track KPIs, and share reports without writing a single line of code.
          </p>
          
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
            <div>
              <div className="text-2xl font-bold text-white">10k+</div>
              <div className="text-sm text-slate-400">Reports Generated</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">99.9%</div>
              <div className="text-sm text-slate-400">Uptime</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">0s</div>
              <div className="text-sm text-slate-400">Setup Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Form Section */}
      <div className="w-full md:w-1/2 lg:w-1/3 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-primary mb-2">
              <FileSpreadsheet className="w-6 h-6" />
              <span className="font-bold text-lg">SheetSync</span>
            </div>
            <CardTitle className="text-2xl font-bold">Connect Data Source</CardTitle>
            <CardDescription>
              Enter your Google Sheet ID to begin visualization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 text-blue-800 border-blue-200">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Demo Mode</AlertTitle>
              <AlertDescription>
                Try ID: <strong>1BxiMVs0XRA5nFMdKvBdBkJGMfr13d3e</strong>
              </AlertDescription>
            </Alert>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="sheetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Sheet ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 1BxiMVs0..." {...field} className="font-mono text-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 transition-all shadow-md hover:shadow-lg" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect Sheet"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 text-center text-sm text-muted-foreground">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Security
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Read-only access</span>
              <span className="mx-2">•</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Encrypted transfer</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
