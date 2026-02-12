import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, KeyRound, Hash, Info, ExternalLink } from "lucide-react";
import { validateSheet, saveConfig, getServerConfig, type SheetConfig } from "@/lib/sheets-api";
import { useToast } from "@/hooks/use-toast";
import heroBg from "@/assets/hero-bg.png";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const formSchema = z.object({
  sheetId: z.string().min(5, "Sheet ID must be at least 5 characters"),
  apiKey: z.string().min(10, "API Key looks too short"),
  sheetName: z.string().optional(),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sheetId: "",
      apiKey: "",
      sheetName: "",
    },
  });

  useEffect(() => {
    async function autoConnect() {
      try {
        const serverConfig = await getServerConfig();
        if (serverConfig.hasServerConfig) {
          const result = await validateSheet({ sheetId: serverConfig.sheetId, useServerConfig: true });
          if (result.valid) {
            const config: SheetConfig = {
              sheetId: serverConfig.sheetId,
              useServerConfig: true,
              sheetName: result.sheetNames?.[0],
            };
            saveConfig(config);
            toast({
              title: "Connected",
              description: `Loading "${result.title}"...`,
            });
            setLocation("/dashboard");
            return;
          }
        }
      } catch (e) {
        console.error("Auto-connect failed:", e);
      }
      setIsAutoConnecting(false);
    }
    autoConnect();
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setValidationError(null);
    setErrorType(null);

    try {
      const config: SheetConfig = {
        sheetId: values.sheetId.trim(),
        apiKey: values.apiKey.trim(),
        sheetName: values.sheetName?.trim() || undefined,
      };

      const result = await validateSheet(config);

      if (result.valid) {
        if (result.sheetNames && result.sheetNames.length > 0 && !config.sheetName) {
          config.sheetName = result.sheetNames[0];
        }
        saveConfig(config);
        toast({
          title: "Connected Successfully",
          description: `Linked to "${result.title}". Loading your data...`,
        });
        setTimeout(() => setLocation("/dashboard"), 800);
      } else {
        setValidationError(result.error || "Could not connect to the spreadsheet.");
        setErrorType(result.errorType || null);
      }
    } catch (error: any) {
      setValidationError("Network error. Please check your internet connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isAutoConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Connecting to your spreadsheet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Hero Section */}
      <div className="relative w-full lg:w-1/2 xl:w-2/3 bg-slate-900 overflow-hidden flex flex-col justify-center items-center text-white p-8 md:p-12 min-h-[300px] lg:min-h-screen">
        <div
          className="absolute inset-0 z-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Google Sheets API v4
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Turn your <span className="text-blue-400">Spreadsheets</span> into{" "}
            <span className="text-emerald-400">Insights</span>.
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Connect your Google Sheets to generate live dashboards, summary statistics, and sortable reports automatically.
          </p>

          <div className="pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Setup Guide</h3>
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="step1" className="border border-white/10 rounded-lg px-4 bg-white/5">
                <AccordionTrigger className="text-sm text-slate-200 hover:no-underline">
                  Step 1: Create a Google API Key
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-blue-400 underline inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Create a new project (or select an existing one)</li>
                    <li>Click <strong>"+ CREATE CREDENTIALS"</strong> at the top</li>
                    <li>Select <strong>"API key"</strong></li>
                    <li>Copy the generated key</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step2" className="border border-white/10 rounded-lg px-4 bg-white/5">
                <AccordionTrigger className="text-sm text-slate-200 hover:no-underline">
                  Step 2: Enable Google Sheets API
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>In Google Cloud Console, go to <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener" className="text-blue-400 underline inline-flex items-center gap-1">Sheets API page <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Click the blue <strong>"ENABLE"</strong> button</li>
                    <li>Wait a few seconds for it to activate</li>
                  </ol>
                  <p className="text-amber-300 text-xs mt-2">This is the most commonly missed step!</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step3" className="border border-white/10 rounded-lg px-4 bg-white/5">
                <AccordionTrigger className="text-sm text-slate-200 hover:no-underline">
                  Step 3: Share Your Spreadsheet
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Open your Google Spreadsheet</li>
                    <li>Click the <strong>"Share"</strong> button (top-right)</li>
                    <li>Under "General access", change to <strong>"Anyone with the link"</strong></li>
                    <li>Set the role to <strong>"Viewer"</strong></li>
                    <li>Click <strong>"Done"</strong></li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step4" className="border border-white/10 rounded-lg px-4 bg-white/5">
                <AccordionTrigger className="text-sm text-slate-200 hover:no-underline">
                  Step 4: Find Your Sheet ID
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-300 space-y-2">
                  <p>Your Sheet ID is in the spreadsheet URL:</p>
                  <div className="bg-black/30 rounded p-2 font-mono text-xs break-all">
                    https://docs.google.com/spreadsheets/d/<span className="text-emerald-400 font-bold">1BxiMVs0XRA5nFMdKvBdBZjGmuDJp6...</span>/edit
                  </div>
                  <p className="text-xs">Copy the highlighted part between <code>/d/</code> and <code>/edit</code></p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="w-full lg:w-1/2 xl:w-1/3 flex items-center justify-center p-6 md:p-8 bg-background">
        <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-primary mb-2">
              <FileSpreadsheet className="w-6 h-6" />
              <span className="font-bold text-lg">SheetSync</span>
            </div>
            <CardTitle className="text-2xl font-bold">Connect Your Sheet</CardTitle>
            <CardDescription>
              Enter your Google API Key and Sheet ID to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Connection Failed</AlertTitle>
                <AlertDescription className="text-sm mt-1">{validationError}</AlertDescription>
                {errorType === "API_NOT_ENABLED" && (
                  <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline">
                    Enable Google Sheets API <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        Google API Key
                      </FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="AIzaSy..." {...field} className="font-mono text-sm" data-testid="input-api-key" />
                      </FormControl>
                      <FormDescription className="text-xs">From Google Cloud Console &gt; Credentials</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sheetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5" />
                        Sheet ID
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="1BxiMVs0XRA5nFMd..." {...field} className="font-mono text-sm" data-testid="input-sheet-id" />
                      </FormControl>
                      <FormDescription className="text-xs">The long string from your spreadsheet URL</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sheetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        Tab Name <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Sheet1" {...field} className="text-sm" data-testid="input-sheet-name" />
                      </FormControl>
                      <FormDescription className="text-xs">Leave empty to use the first tab</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 transition-all shadow-md hover:shadow-lg" disabled={isLoading} data-testid="button-connect">
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
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Security</span></div>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Read-only access</span>
              <span className="mx-2">&bull;</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Key stored locally only</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
