"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ResourcesDataTable } from "./ResourcesDataTable";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@app/components/ui/dropdown-menu";
import { Button } from "@app/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@app/api";
import CreateResourceForm from "./CreateResourceForm";
import { useState } from "react";

export type ResourceRow = {
    id: number;
    name: string;
    orgId: string;
    domain: string;
    site: string;
};

type ResourcesTableProps = {
    resources: ResourceRow[];
    orgId: string;
};

export default function SitesTable({ resources, orgId }: ResourcesTableProps) {
    const router = useRouter();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const columns: ColumnDef<ResourceRow>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
        },
        {
            accessorKey: "site",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        Site
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
        },
        {
            accessorKey: "domain",
            header: "Domain",
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const router = useRouter();

                const resourceRow = row.original;

                const deleteResource = (resourceId: number) => {
                    api.delete(`/resource/${resourceId}`)
                        .catch((e) => {
                            console.error("Error deleting resource", e);
                        })
                        .then(() => {
                            router.refresh();
                        });
                };

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                                <Link
                                    href={`/${resourceRow.orgId}/settings/resources/${resourceRow.id}`}
                                >
                                    View settings
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <button
                                    onClick={() =>
                                        deleteResource(resourceRow.id)
                                    }
                                    className="text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                                >
                                    Delete
                                </button>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    return (
        <>
            <CreateResourceForm
                open={isCreateModalOpen}
                setOpen={setIsCreateModalOpen}
            />

            <ResourcesDataTable
                columns={columns}
                data={resources}
                addResource={() => {
                    setIsCreateModalOpen(true);
                }}
            />
        </>
    );
}
