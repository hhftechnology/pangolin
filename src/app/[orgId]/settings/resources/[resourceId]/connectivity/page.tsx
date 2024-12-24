"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AxiosResponse } from "axios";
import { ListTargetsResponse } from "@server/routers/target/listTargets";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@app/components/ui/form";
import { CreateTargetResponse } from "@server/routers/target";
import {
    ColumnDef,
    getFilteredRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getCoreRowModel,
    useReactTable,
    flexRender,
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@app/components/ui/table";
import { useToast } from "@app/hooks/useToast";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { ArrayElement } from "@server/types/ArrayElement";
import { formatAxiosError } from "@app/lib/utils";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/api";
import { GetSiteResponse } from "@server/routers/site";

const addTargetSchema = z.object({
    ip: z.string().ip(),
    method: z.string(),
    port: z
        .string()
        .refine((val) => !isNaN(Number(val)), {
            message: "Port must be a number",
        })
        .transform((val) => Number(val)),
    // protocol: z.string(),
});

type AddTargetFormValues = z.infer<typeof addTargetSchema>;

type LocalTarget = Omit<
    ArrayElement<ListTargetsResponse["targets"]> & {
        new?: boolean;
        updated?: boolean;
    },
    "protocol"
>;

export default function ReverseProxyTargets(props: {
    params: Promise<{ resourceId: number }>;
}) {
    const params = use(props.params);

    const { toast } = useToast();
    const { resource, updateResource } = useResourceContext();

    const api = createApiClient(useEnvContext());

    const [targets, setTargets] = useState<LocalTarget[]>([]);
    const [site, setSite] = useState<GetSiteResponse>();
    const [targetsToRemove, setTargetsToRemove] = useState<number[]>([]);
    const [sslEnabled, setSslEnabled] = useState(resource.ssl);

    const [loading, setLoading] = useState(false);

    const [pageLoading, setPageLoading] = useState(true);

    const addTargetForm = useForm({
        resolver: zodResolver(addTargetSchema),
        defaultValues: {
            ip: "",
            method: "http",
            port: "80",
            // protocol: "TCP",
        },
    });

    useEffect(() => {
        const fetchTargets = async () => {
            try {
                const res = await api.get<AxiosResponse<ListTargetsResponse>>(
                    `/resource/${params.resourceId}/targets`,
                );

                if (res.status === 200) {
                    setTargets(res.data.data.targets);
                }
            } catch (err) {
                console.error(err);
                toast({
                    variant: "destructive",
                    title: "Failed to fetch targets",
                    description: formatAxiosError(
                        err,
                        "An error occurred while fetching targets",
                    ),
                });
            } finally {
                setPageLoading(false);
            }
        };
        fetchTargets();

        const fetchSite = async () => {
            try {
                const res = await api.get<AxiosResponse<GetSiteResponse>>(
                    `/site/${resource.siteId}`,
                );

                if (res.status === 200) {
                    setSite(res.data.data);
                }
            } catch (err) {
                console.error(err);
                toast({
                    variant: "destructive",
                    title: "Failed to fetch resource",
                    description: formatAxiosError(
                        err,
                        "An error occurred while fetching resource",
                    ),
                });
            }
        }
        fetchSite();
    }, []);

    async function addTarget(data: AddTargetFormValues) {
        // Check if target with same IP, port and method already exists
        const isDuplicate = targets.some(
            target => target.ip === data.ip &&
                     target.port === data.port &&
                     target.method === data.method
        );

        if (isDuplicate) {
            toast({
                variant: "destructive",
                title: "Duplicate target",
                description: "A target with these settings already exists",
            });
            return;
        }

        if (site && site.type == "wireguard" && site.subnet) {
            // make sure that the target IP is within the site subnet
            const targetIp = data.ip;
            const subnet = site.subnet;
            if (!isIPInSubnet(targetIp, subnet)) {
                toast({
                    variant: "destructive",
                    title: "Invalid target IP",
                    description: "Target IP must be within the site subnet",
                });
                return;
            }
        }

        const newTarget: LocalTarget = {
            ...data,
            enabled: true,
            targetId: new Date().getTime(),
            new: true,
            resourceId: resource.resourceId,
        };

        setTargets([...targets, newTarget]);
        addTargetForm.reset();
    }

    const removeTarget = (targetId: number) => {
        setTargets([
            ...targets.filter((target) => target.targetId !== targetId),
        ]);

        if (!targets.find((target) => target.targetId === targetId)?.new) {
            setTargetsToRemove([...targetsToRemove, targetId]);
        }
    };

    async function updateTarget(targetId: number, data: Partial<LocalTarget>) {
        setTargets(
            targets.map((target) =>
                target.targetId === targetId
                    ? { ...target, ...data, updated: true }
                    : target,
            ),
        );
    }

    async function saveAll() {
        try {
            setLoading(true);

            const res = await api.post(`/resource/${params.resourceId}`, {
                ssl: sslEnabled,
            });

            updateResource({ ssl: sslEnabled });

            for (let target of targets) {
                const data = {
                    ip: target.ip,
                    port: target.port,
                    // protocol: target.protocol,
                    method: target.method,
                    enabled: target.enabled,
                };

                if (target.new) {
                    const res = await api.put<
                        AxiosResponse<CreateTargetResponse>
                    >(`/resource/${params.resourceId}/target`, data);
                    target.targetId = res.data.data.targetId;
                } else if (target.updated) {
                    const res = await api.post(
                        `/target/${target.targetId}`,
                        data,
                    );
                }

                setTargets([
                    ...targets.map((t) => {
                        let res = {
                            ...t,
                            new: false,
                            updated: false,
                        };
                        return res;
                    }),
                ]);
            }

            for (const targetId of targetsToRemove) {
                await api.delete(`/target/${targetId}`);
                setTargets(
                    targets.filter((target) => target.targetId !== targetId),
                );
            }

            toast({
                title: "Resource updated",
                description: "Resource and targets updated successfully",
            });

            setTargetsToRemove([]);
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: "Operation failed",
                description: formatAxiosError(
                    err,
                    "An error occurred during the save operation",
                ),
            });
        }

        setLoading(false);
    }

    const columns: ColumnDef<LocalTarget>[] = [
        {
            accessorKey: "method",
            header: "Method",
            cell: ({ row }) => (
                <Select
                    defaultValue={row.original.method}
                    onValueChange={(value) =>
                        updateTarget(row.original.targetId, { method: value })
                    }
                >
                    <SelectTrigger>{row.original.method}</SelectTrigger>
                    <SelectContent>
                        <SelectItem value="http">http</SelectItem>
                        <SelectItem value="https">https</SelectItem>
                    </SelectContent>
                </Select>
            ),
        },
        {
            accessorKey: "ip",
            header: "IP Address",
            cell: ({ row }) => (
                <Input
                    defaultValue={row.original.ip}
                    onBlur={(e) =>
                        updateTarget(row.original.targetId, {
                            ip: e.target.value,
                        })
                    }
                />
            ),
        },
        {
            accessorKey: "port",
            header: "Port",
            cell: ({ row }) => (
                <Input
                    type="number"
                    defaultValue={row.original.port}
                    onBlur={(e) =>
                        updateTarget(row.original.targetId, {
                            port: parseInt(e.target.value, 10),
                        })
                    }
                />
            ),
        },
        // {
        //     accessorKey: "protocol",
        //     header: "Protocol",
        //     cell: ({ row }) => (
        //         <Select
        //             defaultValue={row.original.protocol!}
        //             onValueChange={(value) =>
        //                 updateTarget(row.original.targetId, { protocol: value })
        //             }
        //         >
        //             <SelectTrigger>{row.original.protocol}</SelectTrigger>
        //             <SelectContent>
        //                 <SelectItem value="TCP">TCP</SelectItem>
        //                 <SelectItem value="UDP">UDP</SelectItem>
        //             </SelectContent>
        //         </Select>
        //     ),
        // },
        {
            accessorKey: "enabled",
            header: "Enabled",
            cell: ({ row }) => (
                <Switch
                    defaultChecked={row.original.enabled}
                    onCheckedChange={(val) =>
                        updateTarget(row.original.targetId, { enabled: val })
                    }
                />
            ),
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <>
                    <div className="flex items-center justify-end space-x-2">
                        {/* <Dot
                            className={
                                row.original.new || row.original.updated
                                    ? "opacity-100"
                                    : "opacity-0"
                            }
                        /> */}

                        <Button
                            variant="outline"
                            onClick={() => removeTarget(row.original.targetId)}
                        >
                            Delete
                        </Button>
                    </div>
                </>
            ),
        },
    ];

    const table = useReactTable({
        data: targets,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    if (pageLoading) {
        return <></>;
    }

    return (
        <>
            <div className="space-y-12">
                <section className="space-y-8">
                    <SettingsSectionTitle
                        title="SSL"
                        description="Setup SSL to secure your connections with LetsEncrypt certificates"
                        size="1xl"
                    />

                    <div className="flex items-center space-x-2">
                        <Switch
                            id="ssl-toggle"
                            defaultChecked={resource.ssl}
                            onCheckedChange={(val) => setSslEnabled(val)}
                        />
                        <Label htmlFor="ssl-toggle">Enable SSL (https)</Label>
                    </div>
                </section>

                <hr className="lg:max-w-2xl" />

                <section className="space-y-8">
                    <SettingsSectionTitle
                        title="Targets"
                        description="Setup targets to route traffic to your services"
                        size="1xl"
                    />

                    <div className="space-y-8">
                        <Form {...addTargetForm}>
                            <form
                                onSubmit={addTargetForm.handleSubmit(
                                    addTarget as any,
                                )}
                                className="space-y-4"
                            >
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <FormField
                                        control={addTargetForm.control}
                                        name="method"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Method</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        {...field}
                                                        onValueChange={(
                                                            value,
                                                        ) => {
                                                            addTargetForm.setValue(
                                                                "method",
                                                                value,
                                                            );
                                                        }}
                                                    >
                                                        <SelectTrigger id="method">
                                                            <SelectValue placeholder="Select method" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="http">
                                                                HTTP
                                                            </SelectItem>
                                                            <SelectItem value="https">
                                                                HTTPS
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormDescription>
                                                    Choose the method for how
                                                    the target is accessed.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addTargetForm.control}
                                        name="ip"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    IP Address
                                                </FormLabel>
                                                <FormControl>
                                                    <Input id="ip" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    Enter the IP address of the
                                                    target.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addTargetForm.control}
                                        name="port"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Port</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        id="port"
                                                        type="number"
                                                        {...field}
                                                        required
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Specify the port number for
                                                    the target.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* <FormField
                                    control={addTargetForm.control}
                                    name="protocol"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Protocol</FormLabel>
                                            <FormControl>
                                                <Select
                                                    {...field}
                                                    onValueChange={(value) => {
                                                        addTargetForm.setValue(
                                                            "protocol",
                                                            value
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger id="protocol">
                                                        <SelectValue placeholder="Select protocol" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="UDP">
                                                            UDP
                                                        </SelectItem>
                                                        <SelectItem value="TCP">
                                                            TCP
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormDescription>
                                                Select the protocol used by the
                                                target
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                /> */}
                                </div>
                                <Button type="submit" variant="gray">
                                    Add Target
                                </Button>
                            </form>
                        </Form>

                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    {table
                                        .getHeaderGroups()
                                        .map((headerGroup) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map(
                                                    (header) => (
                                                        <TableHead
                                                            key={header.id}
                                                        >
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(
                                                                      header
                                                                          .column
                                                                          .columnDef
                                                                          .header,
                                                                      header.getContext(),
                                                                  )}
                                                        </TableHead>
                                                    ),
                                                )}
                                            </TableRow>
                                        ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row
                                                    .getVisibleCells()
                                                    .map((cell) => (
                                                        <TableCell
                                                            key={cell.id}
                                                        >
                                                            {flexRender(
                                                                cell.column
                                                                    .columnDef
                                                                    .cell,
                                                                cell.getContext(),
                                                            )}
                                                        </TableCell>
                                                    ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={columns.length}
                                                className="h-24 text-center"
                                            >
                                                No targets. Add a target using
                                                the form.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <Button
                            onClick={saveAll}
                            loading={loading}
                            disabled={loading}
                        >
                            Save Changes
                        </Button>
                    </div>
                </section>
            </div>
        </>
    );
}

function isIPInSubnet(subnet: string, ip: string): boolean {
    // Split subnet into IP and mask parts
    const [subnetIP, maskBits] = subnet.split('/');
    const mask = parseInt(maskBits);
    
    if (mask < 0 || mask > 32) {
        throw new Error('Invalid subnet mask. Must be between 0 and 32.');
    }

    // Convert IP addresses to binary numbers
    const subnetNum = ipToNumber(subnetIP);
    const ipNum = ipToNumber(ip);
    
    // Calculate subnet mask
    const maskNum = mask === 32 ? -1 : ~((1 << (32 - mask)) - 1);
    
    // Check if the IP is in the subnet
    return (subnetNum & maskNum) === (ipNum & maskNum);
}

function ipToNumber(ip: string): number {
    // Validate IP address format
    const parts = ip.split('.');
    if (parts.length !== 4) {
        throw new Error('Invalid IP address format');
    }
    
    // Convert IP octets to 32-bit number
    return parts.reduce((num, octet) => {
        const oct = parseInt(octet);
        if (isNaN(oct) || oct < 0 || oct > 255) {
            throw new Error('Invalid IP address octet');
        }
        return (num << 8) + oct;
    }, 0);
}
