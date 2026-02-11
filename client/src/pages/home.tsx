import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, KeyRound, Hash, Info } from "lucide-react";
import { validateSheet, saveConfig, type SheetConfig } from "@/lib/sheets-api";
import { useToast } from "@/hooks/use-toast";
import heroBg from "@/assets/hero-bg.png";

const formSchema = z.object({
  sheetId: z.string().min(5, "Sheet ID must be at least 5 characters"),
  apiKey: z.string().min(10, "API Key looks too short"),
  sheetName: z.string().optional(),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sheetId: "",
      apiKey: "",
      sheetName: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setValidationError(null);

    try {
      const config: SheetConfig = {
        sheetId: values.sheetId,
        apiKey: values.apiKey,
        sheetName: values.sheetName || undefined,
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
      }
    } catch (error: any) {
      setValidationError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Hero Section */}
      <div className="relative w-full lg:w-2/3 bg-slate-900 overflow-hidden flex flex-col justify-center items-center text-white p-8 md:p-12 min-h-[300px] lg:min-h-screen">
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
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Turn your <span className="text-blue-400">Spreadsheets</span> into{" "}
            <span className="text-emerald-400">Insights</span>.
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Connect your Google Sheets to generate live dashboards, summary statistics, and sortable reports automatically.
          </p>

          <div className="space-y-3 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">How to get started</h3>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2">
              <li>Get a Google API Key from the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-blue-400 underline">Google Cloud Console</a></li>
              <li>Enable the <strong>Google Sheets API</strong> in your project</li>
              <li>Make your spreadsheet <strong>viewable by anyone with the link</strong></li>
              <li>Paste your Sheet ID and API Key on the right</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="w-full lg:w-1/3 flex items-center justify-center p-6 md:p-8 bg-background">
        <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-primary mb-2">
              <FileSpreadsheet className="w-6 h-6" />
              <span className="font-bold text-lg">SheetSync</span>
            </div>
            <CardTitle className="text-2xl font-bold">Connect Your Sheet</CardTitle>
            <CardDescription>
              Enter your credentials to link a Google Sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Connection Failed</AlertTitle>
                <AlertDescription>{validationError}</AlertDescription>
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
                      <FormDescription className="text-xs">
                        Your key stays in your browser. Never sent to our servers for storage.
                      </FormDescription>
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
                      <FormDescription className="text-xs">
                        Found in the spreadsheet URL between /d/ and /edit
                      </FormDescription>
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
                        Sheet Tab Name <span className="text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Sheet1" {...field} className="text-sm" data-testid="input-sheet-name" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Leave empty to use the first tab.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 transition-all shadow-md hover:shadow-lg"
                  disabled={isLoading}
                  data-testid="button-connect"
                >
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
                <span className="bg-background px-2 text-muted-foreground">Security</span>
              </div>
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
